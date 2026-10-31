-- ==============================================================================
-- Raft Board: Phase 3 Leaderboard, Team Dashboard & Weekly Close
-- Version: 20261101000004
-- Description: week_scores, month_scores, idempotent close_week function,
--              tie-breaker rules, target snapshots, pg_cron hourly schedule,
--              and RLS policies for leaderboard visibility.
-- ==============================================================================

-- 1. Create week_scores table
create table if not exists public.week_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  task_xp int not null default 0,
  target_snapshot int not null default 80,
  score numeric(5,2), -- null for resting weeks, 0.00 to 120.00 for active weeks
  resting boolean not null default false,
  tasks_finished int not null default 0,
  first_update_at timestamptz,
  rank int,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, week_id)
);

-- Index for leaderboard queries
create index if not exists idx_week_scores_week_rank on public.week_scores(week_id, rank);
create index if not exists idx_week_scores_user on public.week_scores(user_id);

-- 2. Create month_scores table
create table if not exists public.month_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_year text not null, -- Format: YYYY-MM in Asia/Manila timezone
  average_score numeric(5,2), -- average of weekly scores in this month, excluding rest weeks
  weeks_participated int not null default 0,
  weeks_rested int not null default 0,
  total_tasks_finished int not null default 0,
  earliest_update timestamptz,
  rank int,
  is_top_otter boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (user_id, month_year)
);

create index if not exists idx_month_scores_month_rank on public.month_scores(month_year, rank);

-- 3. Row Level Security on week_scores
alter table public.week_scores enable row level security;

-- Policy: Top 3 are visible to everyone; non-top-3 rows visible only to the member or executives
drop policy if exists "Leaderboard visibility rule on week_scores" on public.week_scores;
create policy "Leaderboard visibility rule on week_scores"
  on public.week_scores for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.week_scores.rank <= 3
          or public.week_scores.user_id = auth.uid()
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

-- Policy: Only super admins or service role can insert/update/delete week_scores
drop policy if exists "Super admins manage week_scores" on public.week_scores;
create policy "Super admins manage week_scores"
  on public.week_scores for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.is_super_admin = true
    )
  );

-- 4. Row Level Security on month_scores
alter table public.month_scores enable row level security;

drop policy if exists "Monthly leaderboard visibility on month_scores" on public.month_scores;
create policy "Monthly leaderboard visibility on month_scores"
  on public.month_scores for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.month_scores.rank <= 3
          or public.month_scores.user_id = auth.uid()
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

drop policy if exists "Super admins manage month_scores" on public.month_scores;
create policy "Super admins manage month_scores"
  on public.month_scores for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.is_super_admin = true
    )
  );

-- 5. Helper Function: Close a week, snapshot scores, update streaks, and compute month if finished
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
begin
  select * into v_settings from public.settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Manila');

  -- Identify week to close
  if p_week_id is not null then
    select * into v_week from public.weeks where id = p_week_id;
  else
    select * into v_week from public.weeks
    where is_current = true and now() >= cutoff_at
    order by cutoff_at asc
    limit 1;
  end if;

  if v_week.id is null then
    return json_build_object(
      'success', true,
      'message', 'No pending weeks require closing at this time.'
    );
  end if;

  -- Idempotency check: if already closed, return existing status
  if v_week.is_current = false and exists (select 1 from public.week_scores where week_id = v_week.id) then
    return json_build_object(
      'success', true,
      'already_closed', true,
      'week_id', v_week.id,
      'message', 'Week was already finalized and closed.'
    );
  end if;

  -- Month representation in Asia/Manila for this week's Saturday cutoff
  v_month_year := to_char(timezone(v_tz, v_week.cutoff_at), 'YYYY-MM');

  -- 1. Compute & Snapshot scores for all active members
  for v_profile in (
    select id, full_name, weekly_target_xp
    from public.profiles
    where status = 'active'
    order by full_name asc
  ) loop
    -- Check Rest Mode
    select exists (
      select 1 from public.rest_mode
      where user_id = v_profile.id and week_id = v_week.id
    ) into v_is_resting;

    -- Snapshot target
    v_target := coalesce(v_profile.weekly_target_xp, 80);

    -- Calculate task XP (task_completion only, 150 cap, excluding early bonus or kudos)
    select coalesce(sum(amount), 0) into v_task_xp
    from public.xp_events
    where user_id = v_profile.id
      and week_id = v_week.id
      and reason = 'task_completion'
      and voided = false;

    -- Count finished tasks
    select count(*) into v_tasks_finished
    from public.tasks
    where user_id = v_profile.id
      and week_id = v_week.id
      and status = 'done';

    -- Earliest first update in the week
    select min(t.created_at) into v_first_update
    from public.tasks t
    where t.user_id = v_profile.id and t.week_id = v_week.id;

    if v_is_resting then
      -- Target is waived, excluded from monthly average, never scored as zero
      v_score := null;
    else
      -- Capped at 120.00%
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
  end loop;

  -- 2. Rank non-resting members using tie-breakers:
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

  -- Resting members have rank set to null (never ranked last)
  update public.week_scores set rank = null where week_id = v_week.id and resting = true;

  -- 3. Lock week
  update public.weeks
  set is_current = false,
      updated_at = timezone('utc'::text, now())
  where id = v_week.id;

  -- 4. Open next week
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

  -- 5. Month Close Detection:
  -- If next week's cutoff Saturday falls in the next month, this closing week is the LAST week of the month!
  v_next_month_year := to_char(timezone(v_tz, v_next_cutoff), 'YYYY-MM');
  if v_month_year <> v_next_month_year then
    v_month_closed := true;

    -- Compute monthly averages and rankings for v_month_year
    -- Gathers all closed weeks whose cutoff_at in Asia/Manila falls in v_month_year
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
      and ws.resting = false -- Exclude rest weeks from average!
    group by ws.user_id
    on conflict (user_id, month_year) do update set
      average_score = excluded.average_score,
      weeks_participated = excluded.weeks_participated,
      weeks_rested = excluded.weeks_rested,
      total_tasks_finished = excluded.total_tasks_finished,
      earliest_update = excluded.earliest_update;

    -- Assign monthly ranks using tie-breakers:
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
        and ms.average_score is not null
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

  return json_build_object(
    'success', true,
    'week_closed', v_week.id,
    'next_week_opened', v_next_week.id,
    'month_closed', v_month_closed,
    'month_year', v_month_year,
    'top_otter_user_id', v_top_otter_id,
    'message', 'Week closed successfully. Scores snapshotted, ranks assigned, and next week opened.'
  );
end;
$$ language plpgsql security definer;

-- 6. Setup pg_cron hourly schedule (if available in database extension catalog)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Remove any previous schedule if it exists
    perform cron.unschedule(jobid) from cron.job where jobname = 'raft_board_hourly_close_check';
    -- Schedule hourly check at minute 0
    perform cron.schedule('raft_board_hourly_close_check', '0 * * * *', 'select public.close_week();');
  end if;
exception when others then
  raise notice 'pg_cron extension not installed or restricted. Fallback to API/external scheduler.';
end $$;
