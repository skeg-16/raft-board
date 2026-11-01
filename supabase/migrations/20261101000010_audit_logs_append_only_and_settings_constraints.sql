-- Migration: Append-only audit logs, settings check constraints, and dynamic next week cutoff
-- 1. Enforce append-only on public.audit_logs (no UPDATE, DELETE, or TRUNCATE permitted for anyone)
-- 2. Check constraints on public.settings for meeting_weekday and meeting_time
-- 3. Next week cutoff in close_week() dynamically follows updated settings from settings table

-- 1. Ensure public.audit_logs exists
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.audit_logs enable row level security;

-- Super admins can view audit logs
drop policy if exists "Super admins can view audit logs" on public.audit_logs;
create policy "Super admins can view audit logs"
  on public.audit_logs
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_super_admin = true and status = 'active'
    )
  );

-- Service role and super admins can insert audit logs
drop policy if exists "Super admins and service role can insert audit logs" on public.audit_logs;
create policy "Super admins and service role can insert audit logs"
  on public.audit_logs
  for insert
  with check (
    auth.role() = 'service_role' or
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_super_admin = true and status = 'active'
    )
  );

-- STRICT APPEND-ONLY ENFORCEMENT VIA TRIGGERS & PERMISSIONS
create or replace function public.prevent_audit_logs_mutation()
returns trigger as $$
begin
  raise exception 'Audit logs are strictly append-only. Modification or deletion is not permitted for any role.';
end;
$$ language plpgsql;

drop trigger if exists trigger_prevent_audit_logs_mutation on public.audit_logs;
create trigger trigger_prevent_audit_logs_mutation
before update or delete on public.audit_logs
for each row
execute function public.prevent_audit_logs_mutation();

drop trigger if exists trigger_prevent_audit_logs_truncate on public.audit_logs;
create trigger trigger_prevent_audit_logs_truncate
before truncate on public.audit_logs
for each statement
execute function public.prevent_audit_logs_mutation();

-- Revoke mutation privileges from all roles including service_role
revoke update, delete, truncate on public.audit_logs from public, anon, authenticated, service_role;

-- 2. Check constraints on public.settings
alter table public.settings
  drop constraint if exists check_meeting_weekday_valid,
  add constraint check_meeting_weekday_valid
  check (lower(trim(meeting_weekday)) in ('sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'));

alter table public.settings
  drop constraint if exists check_meeting_time_valid,
  add constraint check_meeting_time_valid
  check (
    meeting_time ~* '^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$'
    or
    meeting_time ~* '^([01]?[0-9]|2[0-3]):[0-5][0-9]$'
  );

-- 3. Dynamic next week calculation in close_week() following updated settings
-- Updates public.close_week() so next week's cutoff uses settings.meeting_weekday & meeting_time
create or replace function public.calculate_next_cutoff(
  p_start_at timestamptz,
  p_weekday text,
  p_time time,
  p_tz text default 'Asia/Manila'
)
returns timestamptz as $$
declare
  v_target_day int;
  v_start_day int;
  v_days_until int;
  v_start_local timestamp;
  v_cutoff_date date;
begin
  case lower(trim(coalesce(p_weekday, 'saturday')))
    when 'sunday' then v_target_day := 0;
    when 'monday' then v_target_day := 1;
    when 'tuesday' then v_target_day := 2;
    when 'wednesday' then v_target_day := 3;
    when 'thursday' then v_target_day := 4;
    when 'friday' then v_target_day := 5;
    else v_target_day := 6; -- saturday
  end case;

  v_start_local := timezone(p_tz, p_start_at);
  v_start_day := extract(dow from v_start_local)::int;

  v_days_until := (v_target_day - v_start_day + 7) % 7;
  if v_days_until = 0 then v_days_until := 7; end if;

  v_cutoff_date := (v_start_local + (v_days_until || ' days')::interval)::date;
  return timezone(p_tz, (v_cutoff_date || ' ' || p_time)::timestamp);
end;
$$ language plpgsql immutable;

-- 4. Replace public.close_week() to dynamically use calculate_next_cutoff() with latest settings
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
  if p_week_id is null then
    select * into v_week from public.weeks where is_current = true limit 1;
    if v_week.id is null or now() < v_week.cutoff_at then
      return json_build_object(
        'success', true,
        'message', 'No pending weeks require closing at this time.'
      );
    end if;
  end if;

  -- Distributed Database Transaction Lock
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
    for update
  ) loop

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

      -- Earliest first update in the week
      select min(t.created_at) into v_first_update
      from public.tasks t
      where t.user_id = v_profile.id and t.week_id = v_week.id;

      -- Score calculation
      if v_is_resting then
        v_score := null;
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

      -- Update Member Streaks
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

    -- B. Rank non-resting members using verified tie-breakers
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

    -- D. Open next week dynamically following updated settings
    select * into v_settings from public.settings where id = 1;
    v_tz := coalesce(v_settings.timezone, 'Asia/Manila');
    v_cutoff_time := public.parse_meeting_time(v_settings.meeting_time);

    v_next_start := v_week.cutoff_at;
    v_next_cutoff := public.calculate_next_cutoff(v_next_start, v_settings.meeting_weekday, v_cutoff_time, v_tz);
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

    -- E. Roll over unfinished tasks to next week
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
