-- ==============================================================================
-- Raft Board: Phase 2 Schema Migration
-- Version: 20261101000001
-- Description: Weeks, Tasks, Quick Picks, XP Events, Rest Mode, RLS, and XP logic
-- ==============================================================================

-- 1. WEEKS TABLE
create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null,
  year integer not null,
  start_at timestamp with time zone not null,
  cutoff_at timestamp with time zone not null,
  is_current boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint weeks_year_week_unique unique (year, week_number)
);

comment on table public.weeks is 'Weekly periods running from one Saturday meeting to the next.';

-- 2. QUICK PICKS TABLE
create table if not exists public.quick_picks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Platforms', 'Marketing', 'Clients', 'Operations', 'Growth', 'Other')),
  label text not null,
  default_size text not null check (default_size in ('small', 'medium', 'big')),
  active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.quick_picks is 'Pre-configured task shortcuts that members can pick for Extras.';

-- Seed realistic quick picks
insert into public.quick_picks (category, label, default_size, active) values
  ('Platforms', 'update Otter Org', 'medium', true),
  ('Platforms', 'update Ottermart', 'medium', true),
  ('Platforms', 'update Otter Digitals', 'big', true),
  ('Marketing', 'post on socials', 'small', true),
  ('Marketing', 'make a pubmat', 'medium', true),
  ('Clients', 'contact a lead', 'small', true),
  ('Clients', 'send a proposal', 'big', true),
  ('Operations', 'update the tracker', 'small', true),
  ('Growth', 'learn a new skill', 'big', true)
on conflict do nothing;

-- 3. TASKS TABLE
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null check (category in ('Platforms', 'Marketing', 'Clients', 'Operations', 'Growth', 'Other')),
  size text not null check (size in ('small', 'medium', 'big')),
  source text not null check (source in ('assigned', 'extra')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'blocked')),
  note text,
  link text,
  is_blocked boolean not null default false,
  blocked_note text,
  finished_at timestamp with time zone,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.tasks is 'Weekly tasks for members (assigned by executives or self-picked Extras).';

-- 4. XP EVENTS TABLE
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  week_id uuid not null references public.weeks(id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('task_completion', 'early_cutoff_bonus')),
  voided boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.xp_events is 'Immutable audit log of all XP awards and bonuses (voided if undone).';

-- 5. REST MODE TABLE
create table if not exists public.rest_mode (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null references public.weeks(id) on delete cascade,
  month_year text not null, -- Format: YYYY-MM
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint rest_mode_user_week_unique unique (user_id, week_id)
);

comment on table public.rest_mode is 'Rest mode activations (waives weekly target, freezes streak, max 2/month).';

-- ==============================================================================
-- DATABASE FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Helper: Get or create current week based on database settings
create or replace function public.get_or_create_current_week()
returns public.weeks as $$
declare
  v_settings public.settings%rowtype;
  v_tz text;
  v_now_tz timestamp;
  v_dow int; -- 0 is Sunday, 6 is Saturday
  v_start_date date;
  v_cutoff_date date;
  v_start_at timestamptz;
  v_cutoff_at timestamptz;
  v_year int;
  v_week_num int;
  v_week public.weeks%rowtype;
begin
  select * into v_settings from public.settings where id = 1 limit 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Manila');

  -- Convert now() to the configured timezone
  v_now_tz := timezone(v_tz, now());
  v_dow := extract(dow from v_now_tz); -- Saturday is 6

  -- Meeting is Saturday at 10:00 AM (default from settings)
  -- If Saturday and past 10:00: week starts today at 10:00 AM, cutoff is next Saturday 10:00 AM
  -- If Saturday before 10:00: week started previous Saturday 10:00 AM, cutoff is today 10:00 AM
  -- If Sun-Fri: week started most recent Saturday 10:00 AM, cutoff is upcoming Saturday 10:00 AM
  if v_dow = 6 then
    if extract(hour from v_now_tz) >= 10 then
      v_start_date := v_now_tz::date;
      v_cutoff_date := (v_now_tz + interval '7 days')::date;
    else
      v_start_date := (v_now_tz - interval '7 days')::date;
      v_cutoff_date := v_now_tz::date;
    end if;
  else
    -- v_dow is 0 (Sunday) to 5 (Friday)
    v_start_date := (v_now_tz - ((v_dow + 1) || ' days')::interval)::date;
    v_cutoff_date := (v_start_date + interval '7 days')::date;
  end if;

  v_start_at := timezone(v_tz, (v_start_date || ' 10:00:00')::timestamp);
  v_cutoff_at := timezone(v_tz, (v_cutoff_date || ' 10:00:00')::timestamp);
  v_year := extract(year from v_cutoff_at);
  v_week_num := extract(week from v_cutoff_at);

  -- Set previous weeks is_current = false
  update public.weeks set is_current = false where is_current = true and (cutoff_at <= now() or start_at > now());

  -- Upsert week
  insert into public.weeks (week_number, year, start_at, cutoff_at, is_current)
  values (v_week_num, v_year, v_start_at, v_cutoff_at, true)
  on conflict (year, week_number)
  do update set is_current = true, cutoff_at = excluded.cutoff_at
  returning * into v_week;

  return v_week;
end;
$$ language plpgsql security definer;

-- Trigger: Prevent modifications to tasks after Saturday cutoff
create or replace function public.check_task_cutoff_lock()
returns trigger as $$
declare
  v_cutoff timestamptz;
begin
  select cutoff_at into v_cutoff from public.weeks where id = coalesce(new.week_id, old.week_id);

  if v_cutoff is not null and now() >= v_cutoff then
    raise exception 'Task cannot be modified: the Saturday cutoff for this week has passed and the week is locked.';
  end if;

  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger trigger_task_cutoff_lock
before update or delete on public.tasks
for each row
execute function public.check_task_cutoff_lock();

-- Transactional Core: Finish task and award XP
create or replace function public.finish_task_and_award_xp(p_task_id uuid)
returns json as $$
declare
  v_task public.tasks%rowtype;
  v_week public.weeks%rowtype;
  v_base_xp int;
  v_current_task_xp int;
  v_available_cap int;
  v_awarded_task_xp int;
  v_bonus_awarded boolean := false;
  v_existing_event public.xp_events%rowtype;
  v_existing_bonus public.xp_events%rowtype;
begin
  -- 1. Lock task row
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.';
  end if;

  select * into v_week from public.weeks where id = v_task.week_id;
  if now() >= v_week.cutoff_at then
    raise exception 'Week is locked: Saturday cutoff (%s) has passed.', v_week.cutoff_at;
  end if;

  -- 2. Idempotency: If already done with active XP event, return existing state
  select * into v_existing_event from public.xp_events
  where task_id = p_task_id and voided = false and reason = 'task_completion'
  limit 1;

  if v_task.status = 'done' and v_existing_event.id is not null then
    return json_build_object(
      'success', true,
      'already_finished', true,
      'task_xp_awarded', v_existing_event.amount,
      'bonus_xp_awarded', 0,
      'message', 'Task was already finished.'
    );
  end if;

  -- 3. Mark task done
  update public.tasks
  set status = 'done',
      is_blocked = false,
      finished_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  -- 4. Calculate task base XP
  if v_task.size = 'small' then
    v_base_xp := 10;
  elsif v_task.size = 'medium' then
    v_base_xp := 30;
  elsif v_task.size = 'big' then
    v_base_xp := 50;
  else
    v_base_xp := 10;
  end if;

  -- 5. Calculate current task XP earned in this week
  select coalesce(sum(amount), 0) into v_current_task_xp
  from public.xp_events
  where user_id = v_task.user_id
    and week_id = v_task.week_id
    and reason = 'task_completion'
    and voided = false;

  -- Weekly cap is 150 task XP
  v_available_cap := greatest(0, 150 - v_current_task_xp);
  v_awarded_task_xp := least(v_base_xp, v_available_cap);

  -- Insert task completion XP event
  insert into public.xp_events (user_id, task_id, week_id, amount, reason, voided)
  values (v_task.user_id, p_task_id, v_task.week_id, v_awarded_task_xp, 'task_completion', false);

  -- 6. Early cutoff bonus: +10 XP for first task finished before cutoff in this week
  if now() < v_week.cutoff_at then
    select * into v_existing_bonus from public.xp_events
    where user_id = v_task.user_id
      and week_id = v_task.week_id
      and reason = 'early_cutoff_bonus'
      and voided = false
    limit 1;

    if v_existing_bonus.id is null then
      insert into public.xp_events (user_id, task_id, week_id, amount, reason, voided)
      values (v_task.user_id, p_task_id, v_task.week_id, 10, 'early_cutoff_bonus', false);
      v_bonus_awarded := true;
    end if;
  end if;

  return json_build_object(
    'success', true,
    'already_finished', false,
    'task_xp_awarded', v_awarded_task_xp,
    'bonus_xp_awarded', case when v_bonus_awarded then 10 else 0 end,
    'new_total_task_xp', v_current_task_xp + v_awarded_task_xp
  );
end;
$$ language plpgsql security definer;

-- Transactional Core: Undo task completion and recalculate cap correctly
create or replace function public.undo_task_completion(p_task_id uuid)
returns json as $$
declare
  v_task public.tasks%rowtype;
  v_week public.weeks%rowtype;
  v_running_xp int := 0;
  v_remaining_tasks_count int;
  r record;
  v_base_xp int;
  v_new_award int;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found.';
  end if;

  select * into v_week from public.weeks where id = v_task.week_id;
  if now() >= v_week.cutoff_at then
    raise exception 'Week is locked: Saturday cutoff has passed. Tasks cannot be undone.';
  end if;

  -- 1. Revert task status
  update public.tasks
  set status = 'todo',
      finished_at = null,
      updated_at = timezone('utc'::text, now())
  where id = p_task_id;

  -- 2. Void this task's XP event
  update public.xp_events
  set voided = true
  where task_id = p_task_id and reason = 'task_completion';

  -- 3. Recalculate remaining finished tasks in this week in order of finished_at
  for r in (
    select e.id, e.amount, t.size
    from public.xp_events e
    join public.tasks t on e.task_id = t.id
    where e.user_id = v_task.user_id
      and e.week_id = v_task.week_id
      and e.reason = 'task_completion'
      and e.voided = false
    order by e.created_at asc
  ) loop
    if r.size = 'small' then v_base_xp := 10;
    elsif r.size = 'medium' then v_base_xp := 30;
    elsif r.size = 'big' then v_base_xp := 50;
    else v_base_xp := 10;
    end if;

    v_new_award := least(v_base_xp, greatest(0, 150 - v_running_xp));
    update public.xp_events set amount = v_new_award where id = r.id;
    v_running_xp := v_running_xp + v_new_award;
  end loop;

  -- 4. Check if any active task remains. If 0, void the early bonus too.
  select count(*) into v_remaining_tasks_count
  from public.xp_events
  where user_id = v_task.user_id
    and week_id = v_task.week_id
    and reason = 'task_completion'
    and voided = false;

  if v_remaining_tasks_count = 0 then
    update public.xp_events
    set voided = true
    where user_id = v_task.user_id
      and week_id = v_task.week_id
      and reason = 'early_cutoff_bonus';
  end if;

  return json_build_object(
    'success', true,
    'message', 'Task marked unfinished and weekly cap recalculated.'
  );
end;
$$ language plpgsql security definer;

-- Rest Mode Management (Max 2 weeks per month)
create or replace function public.toggle_rest_mode(p_week_id uuid)
returns json as $$
declare
  v_user_id uuid;
  v_week public.weeks%rowtype;
  v_month_year text;
  v_existing public.rest_mode%rowtype;
  v_month_count int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthenticated.';
  end if;

  select * into v_week from public.weeks where id = p_week_id;
  if not found then
    raise exception 'Week not found.';
  end if;

  if now() >= v_week.cutoff_at then
    raise exception 'Week is locked: Saturday cutoff has passed.';
  end if;

  v_month_year := to_char(v_week.start_at, 'YYYY-MM');

  -- Check if already in rest mode for this week -> toggle off
  select * into v_existing from public.rest_mode where user_id = v_user_id and week_id = p_week_id;
  if v_existing.id is not null then
    delete from public.rest_mode where id = v_existing.id;
    return json_build_object('success', true, 'resting', false, 'message', 'Rest mode deactivated.');
  end if;

  -- Check monthly limit of 2
  select count(*) into v_month_count from public.rest_mode
  where user_id = v_user_id and month_year = v_month_year;

  if v_month_count >= 2 then
    raise exception 'Rest Mode limit reached: you can only activate Rest Mode for up to 2 weeks per month.';
  end if;

  insert into public.rest_mode (user_id, week_id, month_year)
  values (v_user_id, p_week_id, v_month_year);

  return json_build_object('success', true, 'resting', true, 'message', 'Rest mode activated. Weekly target waived and streak frozen.');
end;
$$ language plpgsql security definer;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.weeks enable row level security;
alter table public.quick_picks enable row level security;
alter table public.tasks enable row level security;
alter table public.xp_events enable row level security;
alter table public.rest_mode enable row level security;

-- WEEKS: All active users can read weeks
create policy "Active members can view weeks"
  on public.weeks for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active'
    )
  );

-- QUICK PICKS: All active members can view active quick picks
create policy "Active members can view active quick picks"
  on public.quick_picks for select
  using (
    active = true and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active'
    )
  );

-- QUICK PICKS: Only executives / super admins can insert, update, or delete
create policy "Executives can manage quick picks"
  on public.quick_picks for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active' and (role_type = 'executive' or is_super_admin = true)
    )
  );

-- TASKS: Read policy
-- Members read their own tasks; Executives read all tasks
create policy "Members read own tasks, executives read all"
  on public.tasks for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.tasks.user_id = auth.uid()
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

-- TASKS: Insert policy
-- Members can insert Extras for themselves. Executives can assign tasks to any active member.
create policy "Members create own extras, executives assign tasks"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          (public.tasks.user_id = auth.uid() and public.tasks.source = 'extra')
          or
          (p.role_type = 'executive' or p.is_super_admin = true)
        )
    )
  );

-- TASKS: Update policy
-- Members update their own tasks; Executives can update tasks they assigned
create policy "Members update own tasks, executives update assigned"
  on public.tasks for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.tasks.user_id = auth.uid()
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

-- TASKS: Delete policy
create policy "Members delete own extras, executives delete assigned"
  on public.tasks for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          (public.tasks.user_id = auth.uid() and public.tasks.source = 'extra')
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

-- XP EVENTS: Read policy
-- Members read their own XP events; Executives read all
create policy "Members read own xp events, executives read all"
  on public.xp_events for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          public.xp_events.user_id = auth.uid()
          or p.role_type = 'executive'
          or p.is_super_admin = true
        )
    )
  );

-- REST MODE: Read & Manage policy
create policy "Members manage own rest mode"
  on public.rest_mode for all
  using (
    auth.uid() = user_id and
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'active'
    )
  );
