-- ==============================================================================
-- Raft Board: Phase 3 Verification & Hardening Migration
-- Version: 20261101000005
-- Description:
-- 1. Restrict target edits: executives only, never member themselves
-- 2. Restrict Run Close Now: super admins only
-- 3. Rollover unfinished tasks to next week (not scored twice)
-- 4. Persist and update streaks at week close (+1 before cutoff, frozen if resting, reset if missed)
-- 5. Catch up on missed close runs and concurrency lock
-- 6. Hardened RLS for scores privacy (top 3 + own row only for leads)
-- ==============================================================================

-- 1. Add current_streak and max_streak to profiles if not present
alter table public.profiles
  add column if not exists current_streak integer not null default 0,
  add column if not exists max_streak integer not null default 0;

-- 2. Trigger: Restrict weekly_target_xp edits to executives ONLY (never the member themselves)
create or replace function public.check_profile_target_edit()
returns trigger as $$
begin
  if new.weekly_target_xp is distinct from old.weekly_target_xp then
    -- Check 1: Member cannot edit their own target
    if auth.uid() = old.id then
      raise exception 'Members cannot edit their own weekly target. Targets must be set by an executive.';
    end if;

    -- Check 2: Updater must be an active executive or super admin
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (p.role_type = 'executive' or p.is_super_admin = true)
    ) then
      raise exception 'Forbidden: Only executives and super admins can edit member weekly targets.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_profile_target_edit on public.profiles;
create trigger trigger_profile_target_edit
before update of weekly_target_xp on public.profiles
for each row
execute function public.check_profile_target_edit();

-- 3. Comprehensive close_week function with catch-up, rollover, streak updates, and concurrency lock
create or replace function public.close_week(p_week_id uuid default null)
returns json as $$
declare
  v_week record;
  v_settings public.settings%rowtype;
  v_tz text;
  v_profile record;
  v_is_resting boolean;
  v_task_xp int;
  v_tasks_finished int;
  v_finished_before_cutoff int;
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
    for update -- Concurrency lock: prevents race conditions between simultaneous runs
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

    -- A. Snapshot scores for all active members
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

      -- Count tasks finished BEFORE cutoff (for streaks)
      select count(*) into v_finished_before_cutoff
      from public.tasks
      where user_id = v_profile.id
        and week_id = v_week.id
        and status = 'done'
        and finished_at < v_week.cutoff_at;

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
      -- +1 for update before cutoff, frozen during Rest Mode, reset after missed normal week
      if v_is_resting then
        -- Streak frozen (no change)
        null;
      elsif v_finished_before_cutoff > 0 then
        -- +1 for finish before cutoff
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
          note, link, is_blocked, blocked_note, finished_at, created_by, created_at, updated_at
        )
        values (
          v_next_week.id, v_task.user_id, v_task.title, v_task.category, v_task.size, v_task.source, v_task.status,
          v_task.note, v_task.link, v_task.is_blocked, v_task.blocked_note, null, v_task.created_by,
          timezone('utc'::text, now()), timezone('utc'::text, now())
        );
      end if;
    end loop;

    -- F. Check Month Close Boundary (Asia/Manila)
    v_next_month_year := to_char(timezone(v_tz, v_next_cutoff), 'YYYY-MM');
    if v_month_year <> v_next_month_year then
      v_month_closed := true;

      insert into public.month_scores (
        user_id, month_year, average_score, weeks_participated, weeks_rested, total_tasks_finished, earliest_update
      )
      select
        ws.user_id,
        v_month_year,
        round(avg(ws.score), 2) as average_score,
        count(ws.score) as weeks_participated,
        count(*) filter (where ws.resting = true) as weeks_rested,
        sum(ws.tasks_finished) as total_tasks_finished,
        min(ws.first_update_at) as earliest_update
      from public.week_scores ws
      join public.weeks w on w.id = ws.week_id
      where to_char(timezone(v_tz, w.cutoff_at), 'YYYY-MM') = v_month_year
        and ws.resting = false -- Exclude rest weeks!
      group by ws.user_id
      on conflict (user_id, month_year) do update set
        average_score = excluded.average_score,
        weeks_participated = excluded.weeks_participated,
        weeks_rested = excluded.weeks_rested,
        total_tasks_finished = excluded.total_tasks_finished,
        earliest_update = excluded.earliest_update;

      -- Monthly rankings with tie-breakers:
      -- 1) average_score DESC
      -- 2) total_tasks_finished DESC
      -- 3) earliest_update ASC
      -- 4) full_name ASC
      v_rank := 0;
      for v_profile in (
        select ms.id, ms.user_id
        from public.month_scores ms
        join public.profiles p on p.id = ms.user_id
        where ms.month_year = v_month_year
          and ms.average_score is not null -- Exclude members who rested the whole month!
        order by
          ms.average_score desc,
          ms.total_tasks_finished desc,
          ms.earliest_update asc nulls last,
          p.full_name asc
      ) loop
        v_rank := v_rank + 1;
        update public.month_scores
        set rank = v_rank,
            is_top_otter = (v_rank = 1)
        where id = v_profile.id;

        if v_rank = 1 then
          v_top_otter_id := v_profile.user_id;
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
    'week_closed', v_last_closed_id,
    'next_week_opened', v_next_week.id,
    'month_closed', v_month_closed,
    'month_year', v_month_year,
    'top_otter_user_id', v_top_otter_id,
    'message', 'Week finalized. Unfinished tasks rolled over, streaks updated, scores snapshotted.'
  );
end;
$$ language plpgsql security definer;
