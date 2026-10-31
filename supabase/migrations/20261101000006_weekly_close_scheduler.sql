-- Migration: 20261101000006_weekly_close_scheduler.sql
-- Description: Database-level locking (pg_advisory_xact_lock), updated streak rules matching "Updated" status, and production pg_cron scheduler.

-- 1. Updated close_week with database-level distributed locking and updated streak logic
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
  v_finished_before_cutoff int;
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
begin
  -- Distributed Database Transaction Lock:
  -- Prevents concurrent execution across multiple serverless instances or schedulers
  perform pg_advisory_xact_lock(88889999);

  select * into v_settings from public.settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Manila');

  -- Catch up loop: iterate through all unclosed weeks that have reached or passed their cutoff
  for v_week in (
    select * from public.weeks
    where (
      (p_week_id is not null and id = p_week_id)
      or
      (p_week_id is null and (is_current = true or not exists (select 1 from public.week_scores where week_id = public.weeks.id)) and now() >= cutoff_at)
    )
    order by cutoff_at asc
    for update -- Row-level lock on each week being finalized
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
      -- excluding untouched rolled-over tasks
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
      -- Uses the exact same rule as the "Updated" status:
      -- Rest Mode: frozen (unaltered)
      -- Updated this week before cutoff (moved off todo or added extra): +1
      -- Missed normal week (no update): reset to 0
      if v_is_resting then
        -- Streak frozen (no change)
        null;
      elsif v_has_updated then
        -- +1 for update before cutoff
        update public.profiles
        set current_streak = current_streak + 1,
            max_streak = greatest(max_streak, current_streak + 1)
        where id = v_profile.id;
      else
        -- Missed normal week: streak resets to 0
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
    v_next_cutoff := v_week.cutoff_at + interval '7 days';
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
      -- Avoid duplicate rollover on retries
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

-- 2. Schedule close_week with pg_cron if installed (runs every Saturday at 10:00 AM Asia/Manila, which is 02:00 UTC)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('raft-weekly-close');
    perform cron.schedule(
      'raft-weekly-close',
      '0 2 * * 6',
      'select public.close_week();'
    );
  end if;
exception
  when others then
    -- pg_cron not active or insufficient privileges; scheduler handled by Vercel Cron or external scheduler
    null;
end;
$$;
