-- Migration: 20261101000007_weekly_close_refinements.sql
-- Description:
-- 1. Sets pg_cron schedule to run every minute (* * * * *), not tied to any weekday in UTC.
-- 2. Fast-exit in close_week() unless Saturday cutoff has passed AND current week is still open.
-- 3. Dynamic trigger on public.settings so updating meeting_time immediately adjusts the next cutoff with zero cron changes.

-- 1. Helper to parse meeting_time string (handles '10:00', '10:00 AM', '14:30', '2:30 PM')
create or replace function public.parse_meeting_time(p_time text)
returns time as $$
declare
  v_cleaned text;
  v_parts text[];
  v_hour int;
  v_min int;
  v_is_pm boolean := false;
begin
  if p_time is null or length(trim(p_time)) = 0 then
    return '10:00:00'::time;
  end if;

  v_cleaned := trim(upper(p_time));
  if v_cleaned like '%PM%' then
    v_is_pm := true;
  end if;
  v_cleaned := replace(replace(v_cleaned, ' AM', ''), ' PM', '');
  v_cleaned := replace(replace(v_cleaned, 'AM', ''), 'PM', '');
  v_cleaned := trim(v_cleaned);

  v_parts := string_to_array(v_cleaned, ':');
  v_hour := v_parts[1]::int;
  v_min := coalesce(v_parts[2]::int, 0);

  if v_is_pm and v_hour < 12 then
    v_hour := v_hour + 12;
  elsif not v_is_pm and v_hour = 12 then
    v_hour := 0;
  end if;

  return make_time(v_hour, v_min, 0);
exception
  when others then
    return '10:00:00'::time;
end;
$$ language plpgsql immutable;

-- 2. Trigger on settings: When meeting time/day changes, next cutoff on the open week immediately follows it
create or replace function public.handle_settings_meeting_update()
returns trigger as $$
declare
  v_tz text;
  v_cutoff_time time;
  v_target_cutoff timestamptz;
  v_week record;
  v_cutoff_date date;
begin
  v_tz := coalesce(new.timezone, 'Asia/Manila');
  v_cutoff_time := public.parse_meeting_time(new.meeting_time);

  -- Adjust cutoff_at for any currently open week
  for v_week in (select * from public.weeks where is_current = true) loop
    v_cutoff_date := (timezone(v_tz, v_week.cutoff_at))::date;
    v_target_cutoff := timezone(v_tz, (v_cutoff_date || ' ' || v_cutoff_time)::timestamp);

    update public.weeks
    set cutoff_at = v_target_cutoff,
        updated_at = timezone('utc'::text, now())
    where id = v_week.id;
  end loop;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_settings_meeting_update on public.settings;
create trigger trigger_settings_meeting_update
after update of meeting_time, meeting_weekday, timezone on public.settings
for each row
execute function public.handle_settings_meeting_update();

-- 3. Canonical close_week() function
-- Fast-exits immediately unless Saturday cutoff (from settings, Asia/Manila) has passed AND current week is open
create or replace function public.close_week(p_week_id uuid default null)
returns json as $$
declare
  v_week public.weeks%rowtype;
  v_settings public.settings%rowtype;
  v_tz text;
  v_profile record;
  v_is_resting boolean;
  v_task_xp int;
  v_tasks_finished int;
  v_has_updated boolean;
  v_first_update timestamptz;
  v_target int;
  v_score numeric(5,2);
  v_rank int := 0;
  v_next_week public.weeks%rowtype;
  v_next_start timestamptz;
  v_next_cutoff timestamptz;
  v_next_week_num int;
  v_next_year int;
  v_month_year text;
  v_next_month_year text;
  v_month_closed boolean := false;
  v_top_otter_id uuid;
  v_closed_count int := 0;
  v_last_closed_id uuid;
  v_task record;
  v_cutoff_time time;
begin
  -- Fast Exit Check before acquiring transaction lock:
  -- If invoked without specific week ID, verify an open week exists whose cutoff has passed
  if p_week_id is null then
    select * into v_week from public.weeks where is_current = true limit 1;
    if v_week.id is null or now() < v_week.cutoff_at then
      return json_build_object(
        'success', true,
        'message', 'No pending weeks require closing at this time.'
      );
    end if;
  end if;

  -- Distributed Database Transaction Lock:
  -- Serializes simultaneous executions across pg_cron, API routes, and super admin triggers
  perform pg_advisory_xact_lock(88889999);

  select * into v_settings from public.settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Manila');
  v_cutoff_time := public.parse_meeting_time(v_settings.meeting_time);

  -- Catch up loop: iterate through all unclosed weeks that have reached or passed their cutoff
  for v_week in (
    select * from public.weeks
    where (
      (p_week_id is not null and id = p_week_id)
      or
      (p_week_id is null and (is_current = true or not exists (select 1 from public.week_scores where week_id = public.weeks.id)) and now() >= cutoff_at)
    )
    order by cutoff_at asc
    for update -- Row-level lock on the week being closed
  ) loop

    -- Check if this specific week was already finalized
    if v_week.is_current = false and exists (select 1 from public.week_scores where week_id = v_week.id) then
      if p_week_id is not null then
        return json_build_object(
          'success', true,
          'already_closed', true,
          'week_id', v_week.id,
          'message', 'Week was already finalized and closed.'
        );
      end if;
      continue;
    end if;

    v_month_year := to_char(timezone(v_tz, v_week.cutoff_at), 'YYYY-MM');

    -- A. Snapshot scores and update streaks for all active members
    for v_profile in (
      select id, full_name, weekly_target_xp, current_streak, max_streak
      from public.profiles
      where status = 'active'
      order by full_name asc
    ) loop
      -- Check Rest Mode
      select exists (
        select 1 from public.rest_mode
        where user_id = v_profile.id and week_id = v_week.id
      ) into v_is_resting;

      -- Target snapshot
      v_target := coalesce(v_profile.weekly_target_xp, 80);

      -- Task XP only (task_completion only, capped at 150, excluding early bonus or kudos)
      select coalesce(sum(amount), 0) into v_task_xp
      from public.xp_events
      where user_id = v_profile.id
        and week_id = v_week.id
        and reason = 'task_completion'
        and voided = false;

      -- Count tasks finished in this week
      select count(*) into v_tasks_finished
      from public.tasks
      where user_id = v_profile.id
        and week_id = v_week.id
        and status = 'done';

      -- Check "Updated" criteria for this week:
      -- A member updated if they moved a task off todo (doing, done, blocked) OR added an Extra task,
      -- excluding untouched rolled-over tasks from previous weeks
      select exists (
        select 1 from public.tasks
        where user_id = v_profile.id
          and week_id = v_week.id
          and (
            (source = 'extra' and updated_at > v_week.start_at)
            or
            (status in ('doing', 'done', 'blocked') and updated_at > v_week.start_at)
          )
      ) into v_has_updated;

      -- Earliest first update in the week (for tie-breaker)
      select min(t.created_at) into v_first_update
      from public.tasks t
      where t.user_id = v_profile.id and t.week_id = v_week.id;

      -- Score calculation
      if v_is_resting then
        v_score := null; -- Target waived, excluded from monthly average, never scored as zero
      else
        if v_target <= 0 then v_target := 80; end if;
        v_score := least(120.00, round((v_task_xp::numeric / v_target::numeric) * 100.0, 2));
      end if;

      insert into public.week_scores (
        user_id, week_id, task_xp, target_snapshot, score, resting, tasks_finished, first_update_at
      )
      values (
        v_profile.id, v_week.id, v_task_xp, v_target, v_score, v_is_resting, v_tasks_finished, v_first_update
      )
      on conflict (user_id, week_id) do update set
        task_xp = excluded.task_xp,
        target_snapshot = excluded.target_snapshot,
        score = excluded.score,
        resting = excluded.resting,
        tasks_finished = excluded.tasks_finished,
        first_update_at = excluded.first_update_at;

      -- Update Member Streaks:
      -- Follows same rule as "Updated" status:
      -- Rest Mode: frozen (unaltered)
      -- Updated this week before cutoff: +1
      -- Missed normal week: streak resets to 0
      if v_is_resting then
        null;
      elsif v_has_updated then
        update public.profiles
        set current_streak = current_streak + 1,
            max_streak = greatest(max_streak, current_streak + 1)
        where id = v_profile.id;
      else
        update public.profiles
        set current_streak = 0
        where id = v_profile.id;
      end if;

    end loop;

    -- B. Rank non-resting members using verified tie-breakers:
    -- 1) score DESC
    -- 2) tasks_finished DESC
    -- 3) first_update_at ASC (earliest)
    -- 4) full_name ASC (alphabetical)
    v_rank := 0;
    for v_profile in (
      select ws.id
      from public.week_scores ws
      join public.profiles p on p.id = ws.user_id
      where ws.week_id = v_week.id
        and ws.resting = false
      order by
        ws.score desc,
        ws.tasks_finished desc,
        ws.first_update_at asc nulls last,
        p.full_name asc
    ) loop
      v_rank := v_rank + 1;
      update public.week_scores set rank = v_rank where id = v_profile.id;
    end loop;

    update public.week_scores set rank = null where week_id = v_week.id and resting = true;

    -- C. Lock closing week
    update public.weeks
    set is_current = false,
        updated_at = timezone('utc'::text, now())
    where id = v_week.id;

    -- D. Open next week
    v_next_start := v_week.cutoff_at;
    -- Cutoff is 7 days later at the meeting time
    v_next_cutoff := timezone(v_tz, (((timezone(v_tz, v_next_start))::date + interval '7 days')::date || ' ' || v_cutoff_time)::timestamp);
    v_next_year := extract(isoyear from v_next_cutoff);
    v_next_week_num := extract(week from v_next_cutoff);

    insert into public.weeks (
      week_number, year, start_at, cutoff_at, is_current
    )
    values (
      v_next_week_num, v_next_year, v_next_start, v_next_cutoff, true
    )
    on conflict (year, week_number) do update set
      is_current = true
    returning * into v_next_week;

    -- E. ROLL OVER UNFINISHED TASKS TO NEXT WEEK:
    -- Tasks in status ('todo', 'doing', 'blocked') roll over as unfinished to v_next_week
    for v_task in (
      select * from public.tasks
      where week_id = v_week.id
        and status in ('todo', 'doing', 'blocked')
    ) loop
      if not exists (
        select 1 from public.tasks
        where week_id = v_next_week.id
          and user_id = v_task.user_id
          and title = v_task.title
      ) then
        insert into public.tasks (
          week_id, user_id, title, category, size, source, status,
          note, link, is_blocked, blocked_note, finished_at, created_by
        )
        values (
          v_next_week.id, v_task.user_id, v_task.title, v_task.category, v_task.size, v_task.source,
          v_task.status, v_task.note, v_task.link, v_task.is_blocked, v_task.blocked_note,
          null, v_task.created_by
        );
      end if;
    end loop;

    -- F. Check if Month Closed
    v_next_month_year := to_char(timezone(v_tz, v_next_cutoff), 'YYYY-MM');
    if v_month_year <> v_next_month_year then
      v_month_closed := true;

      -- Aggregate monthly score
      insert into public.month_scores (
        user_id, month_year, average_score, weeks_participated, weeks_rested, total_tasks_finished
      )
      select
        ws.user_id,
        v_month_year,
        round(avg(ws.score), 2) as average_score,
        count(case when ws.resting = false and ws.score is not null then 1 end) as weeks_participated,
        count(case when ws.resting = true then 1 end) as weeks_rested,
        sum(ws.tasks_finished) as total_tasks_finished
      from public.week_scores ws
      join public.weeks w on w.id = ws.week_id
      where to_char(timezone(v_tz, w.cutoff_at), 'YYYY-MM') = v_month_year
      group by ws.user_id
      having count(case when ws.resting = false and ws.score is not null then 1 end) > 0
      on conflict (user_id, month_year) do update set
        average_score = excluded.average_score,
        weeks_participated = excluded.weeks_participated,
        weeks_rested = excluded.weeks_rested,
        total_tasks_finished = excluded.total_tasks_finished;

      -- Rank monthly season
      v_rank := 0;
      for v_profile in (
        select ms.id
        from public.month_scores ms
        join public.profiles p on p.id = ms.user_id
        where ms.month_year = v_month_year
        order by
          ms.average_score desc,
          ms.total_tasks_finished desc,
          p.full_name asc
      ) loop
        v_rank := v_rank + 1;
        update public.month_scores
        set rank = v_rank,
            is_top_otter = (v_rank = 1)
        where id = v_profile.id;

        if v_rank = 1 then
          select user_id into v_top_otter_id from public.month_scores where id = v_profile.id;
        end if;
      end loop;

    end if;

    v_closed_count := v_closed_count + 1;
    v_last_closed_id := v_week.id;

  end loop;

  if v_closed_count = 0 then
    return json_build_object(
      'success', true,
      'message', 'No pending weeks require closing at this time.'
    );
  end if;

  return json_build_object(
    'success', true,
    'weeks_closed_count', v_closed_count,
    'last_week_closed', v_last_closed_id,
    'next_week_opened', v_next_week.id,
    'month_closed', v_month_closed,
    'month_year', v_month_year,
    'top_otter_user_id', v_top_otter_id,
    'message', 'Successfully closed weeks, snapshotted scores, updated streaks, and rolled over unfinished tasks.'
  );
end;
$$ language plpgsql security definer;

-- 4. Set pg_cron schedule to run every minute (* * * * *)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('raft-weekly-close');
    perform cron.schedule(
      'raft-weekly-close',
      '* * * * *',
      'select public.close_week();'
    );
  end if;
exception
  when others then
    null;
end;
$$;
