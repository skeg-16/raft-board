-- ========================================================
-- RAFT BOARD PRODUCTION INITIALIZATION SCHEMA
-- Run this script in Supabase SQL Editor
-- ========================================================


-- >>> START MIGRATION: 20261031000001_initial_schema.sql <<<
-- ==============================================================================
-- Raft Board: Initial Schema Migration
-- Version: 20261031000001
-- Description: Creates profiles table, settings table, and RLS policies
-- ==============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role_title text not null,
  role_type text not null check (role_type in ('executive', 'lead')),
  is_super_admin boolean not null default false,
  is_treasurer boolean not null default false,
  weekly_target_xp integer not null default 80 check (weekly_target_xp > 0),
  avatar text,
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.profiles is 'Member profiles for Otter Software Systems team members.';

-- 2. SETTINGS TABLE
create table if not exists public.settings (
  id integer primary key default 1 check (id = 1),
  meeting_weekday text not null default 'Saturday',
  meeting_time text not null default '10:00',
  timezone text not null default 'Asia/Manila',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

comment on table public.settings is 'Global system settings including weekly meeting cadence and timezone.';

-- Seed default settings row
insert into public.settings (id, meeting_weekday, meeting_time, timezone)
values (1, 'Saturday', '10:00', 'Asia/Manila')
on conflict (id) do nothing;

-- 3. UPDATED_AT TRIGGER FUNCTION
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Attach triggers
drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row
  execute procedure public.handle_updated_at();

drop trigger if exists handle_settings_updated_at on public.settings;
create trigger handle_settings_updated_at
  before update on public.settings
  for each row
  execute procedure public.handle_updated_at();

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.settings enable row level security;

-- Security Definer function to check if a user is a super admin without RLS recursion
create or replace function public.is_super_admin(user_id uuid)
returns boolean as $$
declare
  is_admin boolean;
begin
  select is_super_admin into is_admin
  from public.profiles
  where id = user_id and active = true;
  return coalesce(is_admin, false);
end;
$$ language plpgsql security definer set search_path = public;

-- Profiles Policies
drop policy if exists "Authenticated users can view active profiles" on public.profiles;
create policy "Authenticated users can view active profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can update own profile, super admins can update any" on public.profiles;
create policy "Users can update own profile, super admins can update any"
  on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id or public.is_super_admin(auth.uid())
  )
  with check (
    auth.uid() = id or public.is_super_admin(auth.uid())
  );

drop policy if exists "Only super admins can insert profiles" on public.profiles;
create policy "Only super admins can insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_super_admin(auth.uid())
  );

drop policy if exists "Only super admins can delete profiles" on public.profiles;
create policy "Only super admins can delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (
    public.is_super_admin(auth.uid())
  );

-- Settings Policies
drop policy if exists "Authenticated users can view settings" on public.settings;
create policy "Authenticated users can view settings"
  on public.settings
  for select
  to authenticated
  using (true);

drop policy if exists "Only super admins can update settings" on public.settings;
create policy "Only super admins can update settings"
  on public.settings
  for update
  to authenticated
  using (
    public.is_super_admin(auth.uid())
  )
  with check (
    public.is_super_admin(auth.uid())
  );

-- >>> END MIGRATION: 20261031000001_initial_schema.sql <<<

-- >>> START MIGRATION: 20261031000002_self_service_and_approvals.sql <<<
-- ==============================================================================
-- Raft Board: Migration 20261031000002
-- Description: Self-service signups, status approval workflow, and hardened RLS
-- ==============================================================================

-- 1. ADD STATUS AND REQUESTED ROLE COLUMNS TO PROFILES
alter table public.profiles
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'active', 'deactivated'));

alter table public.profiles
  add column if not exists requested_role_title text;

-- Make role_type and role_title nullable initially for pending requests until super admin approval
alter table public.profiles alter column role_type drop not null;
alter table public.profiles alter column role_title drop not null;

-- Default must_change_password to false for self-registered accounts (they choose their own password)
alter table public.profiles alter column must_change_password set default false;

-- 2. UPDATE SETTINGS DEFAULT MEETING TIME
update public.settings
set meeting_time = '10:00 AM'
where id = 1 and meeting_time = '10:00';

-- 3. HARDENED ROW LEVEL SECURITY (RLS) POLICIES

-- Helper to check if a user is an active super admin
create or replace function public.is_super_admin(user_id uuid)
returns boolean as $$
declare
  is_admin boolean;
begin
  select (is_super_admin = true and status = 'active') into is_admin
  from public.profiles
  where id = user_id;
  return coalesce(is_admin, false);
end;
$$ language plpgsql security definer set search_path = public;

-- Helper to check if a user is active
create or replace function public.is_active_member(user_id uuid)
returns boolean as $$
declare
  is_active boolean;
begin
  select (status = 'active') into is_active
  from public.profiles
  where id = user_id;
  return coalesce(is_active, false);
end;
$$ language plpgsql security definer set search_path = public;

-- PROFILES SELECT POLICY:
-- - A user can view their own profile (even if pending)
-- - Active members can view other active member profiles
-- - Super admins can view all profiles (including pending signups)
drop policy if exists "Authenticated users can view active profiles" on public.profiles;
drop policy if exists "Active users and super admins can view active profiles" on public.profiles;

create policy "Profiles select policy"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (
      public.is_active_member(auth.uid()) and status = 'active'
    )
    or public.is_super_admin(auth.uid())
  );

-- PROFILES UPDATE POLICY:
-- - Super admins can update any profile (assigning role, flags, status)
-- - Regular users can update only their own profile, but CANNOT alter status, role_type, is_super_admin, or is_treasurer
drop policy if exists "Users can update own profile, super admins can update any" on public.profiles;
drop policy if exists "Profiles update policy" on public.profiles;

create policy "Profiles update policy"
  on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id or public.is_super_admin(auth.uid())
  )
  with check (
    public.is_super_admin(auth.uid())
    or (
      auth.uid() = id
      and status = (select p.status from public.profiles p where p.id = auth.uid())
      and coalesce(role_type, '') = coalesce((select p.role_type from public.profiles p where p.id = auth.uid()), '')
      and is_super_admin = (select p.is_super_admin from public.profiles p where p.id = auth.uid())
      and is_treasurer = (select p.is_treasurer from public.profiles p where p.id = auth.uid())
    )
  );

-- PROFILES INSERT POLICY:
-- Users can insert their own profile on registration (with status = 'pending', super_admin = false, treasurer = false)
-- or super admins / service role can insert
drop policy if exists "Only super admins can insert profiles" on public.profiles;
drop policy if exists "Profiles insert policy" on public.profiles;

create policy "Profiles insert policy"
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_super_admin(auth.uid())
    or (
      auth.uid() = id
      and is_super_admin = false
      and is_treasurer = false
    )
  );

-- SETTINGS SELECT POLICY:
-- Only active members or super admins can read system settings
drop policy if exists "Authenticated users can view settings" on public.settings;
drop policy if exists "Settings select policy" on public.settings;

create policy "Settings select policy"
  on public.settings
  for select
  to authenticated
  using (
    public.is_active_member(auth.uid())
    or public.is_super_admin(auth.uid())
  );

-- >>> END MIGRATION: 20261031000002_self_service_and_approvals.sql <<<

-- >>> START MIGRATION: 20261031000003_persistent_rate_limits.sql <<<
-- ==============================================================================
-- Raft Board: Migration 20261031000003
-- Description: Persistent serverless rate limiting table and atomic RPC
-- ==============================================================================

-- 1. Persistent rate limits table
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index on reset_at for fast queries and cleanup
create index if not exists idx_rate_limits_reset_at on public.rate_limits (reset_at);

comment on table public.rate_limits is 'Persistent sliding-window rate limiting shared across serverless instances.';

-- Enable RLS (Service Role / Security Definer access only)
alter table public.rate_limits enable row level security;

-- 2. Atomic rate-limiting function
create or replace function public.consume_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_in_seconds integer
) as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_record public.rate_limits%rowtype;
  v_reset_at timestamp with time zone;
begin
  -- Lock row for update to ensure atomic concurrency across serverless functions
  select * into v_record
  from public.rate_limits
  where key = p_key
  for update;

  if not found or v_now > v_record.reset_at then
    -- Expired window or new key: initialize new window
    v_reset_at := v_now + (p_window_seconds || ' seconds')::interval;
    
    insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, v_reset_at)
    on conflict (key) do update set
      count = 1,
      reset_at = v_reset_at;

    return query select true, p_max_attempts - 1, p_window_seconds;
  else
    -- Active window
    if v_record.count >= p_max_attempts then
      -- Rate limit exceeded
      return query select
        false,
        0,
        greatest(1, ceil(extract(epoch from (v_record.reset_at - v_now))))::integer;
    else
      -- Increment attempt count
      update public.rate_limits
      set count = count + 1
      where key = p_key;

      return query select
        true,
        p_max_attempts - (v_record.count + 1),
        greatest(1, ceil(extract(epoch from (v_record.reset_at - v_now))))::integer;
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- >>> END MIGRATION: 20261031000003_persistent_rate_limits.sql <<<

-- >>> START MIGRATION: 20261101000001_phase2_weeks_tasks_xp.sql <<<
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

-- >>> END MIGRATION: 20261101000001_phase2_weeks_tasks_xp.sql <<<

-- >>> START MIGRATION: 20261101000003_phase2_verification_hardening.sql <<<
-- ==============================================================================
-- Raft Board: Phase 2 Hardening & Verification Migration
-- Version: 20261101000003
-- Description: Recalculate XP on undo/delete, block size edits on finished tasks,
--              re-award early bonus to next finished task, assign only to active members,
--              and Asia/Manila calendar month for Rest Mode.
-- ==============================================================================

-- 1. Helper function: Recalculate week XP & bonus after undo, size change, or task delete
create or replace function public.recalculate_week_xp(p_user_id uuid, p_week_id uuid)
returns void as $$
declare
  v_week public.weeks%rowtype;
  v_running_xp int := 0;
  r record;
  v_base_xp int;
  v_new_award int;
  v_earliest_task record;
  v_bonus_event public.xp_events%rowtype;
begin
  select * into v_week from public.weeks where id = p_week_id;

  -- 1. Re-calculate all non-voided task completions in chronological order
  for r in (
    select e.id, t.size
    from public.xp_events e
    join public.tasks t on e.task_id = t.id
    where e.user_id = p_user_id
      and e.week_id = p_week_id
      and e.reason = 'task_completion'
      and e.voided = false
    order by e.created_at asc
  ) loop
    if r.size = 'small' then v_base_xp := 10;
    elsif r.size = 'medium' then v_base_xp := 30;
    elsif r.size = 'big' then v_base_xp := 50;
    else v_base_xp := 10;
    end if;

    -- Award up to 150 task XP weekly cap
    v_new_award := least(v_base_xp, greatest(0, 150 - v_running_xp));
    update public.xp_events set amount = v_new_award where id = r.id;
    v_running_xp := v_running_xp + v_new_award;
  end loop;

  -- 2. Bonus Re-Award Rule:
  -- Find the active early bonus event for this user & week
  select * into v_bonus_event from public.xp_events
  where user_id = p_user_id
    and week_id = p_week_id
    and reason = 'early_cutoff_bonus'
    and voided = false
  limit 1;

  -- Find the earliest remaining finished task before cutoff in this week
  select t.id, t.finished_at into v_earliest_task
  from public.tasks t
  join public.xp_events e on e.task_id = t.id and e.reason = 'task_completion' and e.voided = false
  where t.user_id = p_user_id
    and t.week_id = p_week_id
    and t.status = 'done'
    and t.finished_at < v_week.cutoff_at
  order by t.finished_at asc
  limit 1;

  if v_earliest_task.id is not null then
    if v_bonus_event.id is null then
      -- Re-award early bonus to this earliest finished task
      insert into public.xp_events (user_id, task_id, week_id, amount, reason, voided)
      values (p_user_id, v_earliest_task.id, p_week_id, 10, 'early_cutoff_bonus', false);
    else
      -- Point the bonus to the earliest remaining task
      update public.xp_events
      set task_id = v_earliest_task.id
      where id = v_bonus_event.id;
    end if;
  else
    -- No tasks remaining finished before cutoff -> void the bonus
    if v_bonus_event.id is not null then
      update public.xp_events set voided = true where id = v_bonus_event.id;
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- 2. Updated undo_task_completion using recalculate_week_xp
create or replace function public.undo_task_completion(p_task_id uuid)
returns json as $$
declare
  v_task public.tasks%rowtype;
  v_week public.weeks%rowtype;
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

  -- 2. Void this task's completion XP event
  update public.xp_events
  set voided = true
  where task_id = p_task_id and reason = 'task_completion';

  -- 3. If this task held the early bonus, void that event so recalculate can re-award to next task
  update public.xp_events
  set voided = true
  where task_id = p_task_id and reason = 'early_cutoff_bonus';

  -- 4. Recalculate cap and re-award early bonus to next task
  perform public.recalculate_week_xp(v_task.user_id, v_task.week_id);

  return json_build_object(
    'success', true,
    'message', 'Task marked unfinished, bonus re-evaluated, and weekly cap recalculated.'
  );
end;
$$ language plpgsql security definer;

-- 3. Trigger: Block editing size on finished tasks
create or replace function public.check_task_finished_size_edit()
returns trigger as $$
begin
  if old.status = 'done' and new.size is distinct from old.size then
    raise exception 'Cannot edit the size of a finished task. Please mark the task unfinished (undo) first.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_task_finished_size_edit on public.tasks;
create trigger trigger_task_finished_size_edit
before update of size on public.tasks
for each row
execute function public.check_task_finished_size_edit();

-- 4. Trigger: Recalculate XP when a task is deleted
create or replace function public.handle_task_delete_recalculate()
returns trigger as $$
begin
  -- Void any XP events associated with deleted task
  update public.xp_events
  set voided = true
  where task_id = old.id;

  -- Recalculate remaining tasks and re-award early bonus if applicable
  perform public.recalculate_week_xp(old.user_id, old.week_id);
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_task_delete_recalculate on public.tasks;
create trigger trigger_task_delete_recalculate
after delete on public.tasks
for each row
execute function public.handle_task_delete_recalculate();

-- 5. Updated RLS: Executives can assign tasks ONLY to active members
drop policy if exists "Members create own extras, executives assign tasks" on public.tasks;
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
          (
            (p.role_type = 'executive' or p.is_super_admin = true)
            and exists (
              select 1 from public.profiles target
              where target.id = public.tasks.user_id and target.status = 'active'
            )
          )
        )
    )
  );

-- 6. Updated toggle_rest_mode using Asia/Manila calendar month
create or replace function public.toggle_rest_mode(p_week_id uuid)
returns json as $$
declare
  v_user_id uuid;
  v_week public.weeks%rowtype;
  v_settings public.settings%rowtype;
  v_tz text;
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

  select * into v_settings from public.settings where id = 1;
  v_tz := coalesce(v_settings.timezone, 'Asia/Manila');

  -- Format calendar month strictly in Asia/Manila timezone
  v_month_year := to_char(timezone(v_tz, v_week.start_at), 'YYYY-MM');

  -- Check if already resting -> toggle off
  select * into v_existing from public.rest_mode where user_id = v_user_id and week_id = p_week_id;
  if v_existing.id is not null then
    delete from public.rest_mode where id = v_existing.id;
    return json_build_object('success', true, 'resting', false, 'message', 'Rest mode deactivated.');
  end if;

  -- Check monthly limit of 2 in Asia/Manila calendar month
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

-- >>> END MIGRATION: 20261101000003_phase2_verification_hardening.sql <<<

-- >>> START MIGRATION: 20261101000004_phase3_leaderboard_close.sql <<<
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

-- >>> END MIGRATION: 20261101000004_phase3_leaderboard_close.sql <<<

-- >>> START MIGRATION: 20261101000005_phase3_verification_hardening.sql <<<
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

-- >>> END MIGRATION: 20261101000005_phase3_verification_hardening.sql <<<

-- >>> START MIGRATION: 20261101000006_weekly_close_scheduler.sql <<<
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

-- >>> END MIGRATION: 20261101000006_weekly_close_scheduler.sql <<<

-- >>> START MIGRATION: 20261101000007_weekly_close_refinements.sql <<<
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

-- >>> END MIGRATION: 20261101000007_weekly_close_refinements.sql <<<

-- >>> START MIGRATION: 20261101000008_every_minute_cron_and_assignment.sql <<<
-- Migration: Set pg_cron schedule to run every minute (* * * * *)
-- Not tied to a weekday in UTC. Fast-exit in public.close_week() handles immediate no-op.
-- Updates settings trigger to dynamically handle meeting_time and meeting_weekday adjustments.

-- 1. Refined trigger function handling both meeting_time and meeting_weekday
create or replace function public.handle_settings_meeting_update()
returns trigger as $$
declare
  v_tz text;
  v_cutoff_time time;
  v_target_cutoff timestamptz;
  v_week record;
  v_target_day int;
  v_current_day int;
  v_days_until int;
  v_now_local timestamp;
  v_target_date date;
begin
  v_tz := coalesce(new.timezone, 'Asia/Manila');
  v_cutoff_time := public.parse_meeting_time(new.meeting_time);
  
  -- Sunday=0, Monday=1, ..., Saturday=6
  case lower(trim(coalesce(new.meeting_weekday, 'saturday')))
    when 'sunday' then v_target_day := 0;
    when 'monday' then v_target_day := 1;
    when 'tuesday' then v_target_day := 2;
    when 'wednesday' then v_target_day := 3;
    when 'thursday' then v_target_day := 4;
    when 'friday' then v_target_day := 5;
    else v_target_day := 6; -- saturday
  end case;

  v_now_local := timezone(v_tz, now());
  v_current_day := extract(dow from v_now_local)::int;

  if v_current_day = v_target_day then
    -- Cutoff date is today at new meeting_time.
    -- If new meeting_time has already passed today, now >= cutoff_at immediately holds, locking the week.
    v_target_date := v_now_local::date;
  else
    v_days_until := (v_target_day - v_current_day + 7) % 7;
    if v_days_until = 0 then v_days_until := 7; end if;
    v_target_date := (v_now_local + (v_days_until || ' days')::interval)::date;
  end if;

  v_target_cutoff := timezone(v_tz, (v_target_date || ' ' || v_cutoff_time)::timestamp);

  for v_week in (select * from public.weeks where is_current = true) loop
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

-- 2. Update pg_cron to every minute (* * * * *)
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

-- >>> END MIGRATION: 20261101000008_every_minute_cron_and_assignment.sql <<<

-- >>> START MIGRATION: 20261101000009_safety_fixes_settings_and_audit.sql <<<
-- Migration: Safety fixes for settings, current week cutoff, and audit logs
-- 1. Changes to settings table apply starting NEXT week by default (never locks/alters current week)
-- 2. Separate action for modifying current week cutoff with confirmation and audit logging
-- 3. Cutoffs in the past are strictly rejected

-- 1. Drop trigger on public.settings so settings updates do NOT mutate the current open week
drop trigger if exists trigger_settings_meeting_update on public.settings;
drop function if exists public.handle_settings_meeting_update();

-- 2. Audit logs table
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

-- 3. Canonical SQL function to change current week cutoff with confirmation & audit log
create or replace function public.update_current_week_cutoff(
  p_user_id uuid,
  p_new_cutoff timestamptz,
  p_confirmed boolean,
  p_reason text default null
)
returns json as $$
declare
  v_week record;
  v_is_super_admin boolean;
  v_audit_id uuid;
begin
  -- Check super admin
  select is_super_admin into v_is_super_admin
  from public.profiles
  where id = p_user_id and status = 'active';

  if v_is_super_admin is not true then
    raise exception 'Forbidden: Only super admins can change the current week cutoff.';
  end if;

  -- Check confirmation step
  if p_confirmed is not true then
    raise exception 'Confirmation required: Changing the current week cutoff requires explicit confirmation.';
  end if;

  -- Strictly reject any time that has already passed
  if p_new_cutoff <= now() then
    raise exception 'Cannot set cutoff in the past. New cutoff must be in the future.';
  end if;

  -- Find current open week
  select * into v_week from public.weeks where is_current = true limit 1;
  if v_week.id is null then
    raise exception 'No active week found to update.';
  end if;

  -- Update current week
  update public.weeks
  set cutoff_at = p_new_cutoff,
      updated_at = timezone('utc'::text, now())
  where id = v_week.id;

  -- Insert audit log
  insert into public.audit_logs (user_id, action, details)
  values (
    p_user_id,
    'change_current_week_cutoff',
    json_build_object(
      'week_id', v_week.id,
      'old_cutoff', v_week.cutoff_at,
      'new_cutoff', p_new_cutoff,
      'reason', coalesce(p_reason, 'Manual super admin adjustment')
    )
  )
  returning id into v_audit_id;

  return json_build_object(
    'success', true,
    'message', 'Current week cutoff successfully updated.',
    'week_id', v_week.id,
    'old_cutoff', v_week.cutoff_at,
    'new_cutoff', p_new_cutoff,
    'audit_log_id', v_audit_id
  );
end;
$$ language plpgsql security definer;

-- >>> END MIGRATION: 20261101000009_safety_fixes_settings_and_audit.sql <<<

-- >>> START MIGRATION: 20261101000010_audit_logs_append_only_and_settings_constraints.sql <<<
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

-- >>> END MIGRATION: 20261101000010_audit_logs_append_only_and_settings_constraints.sql <<<

-- >>> START MIGRATION: 20261101000011_phase4_super_admin_security.sql <<<
-- Migration: Phase 4 Super Admin Console, Security, 2FA, Lockout Protection, and Fail-Closed Audit Logging
-- 1. Standardize meeting_time as Postgres 'time' column with check constraints
-- 2. Database lockout protection trigger on public.profiles
-- 3. Fail-closed atomic stored procedures for all admin actions
-- 4. public.login_logs table with 90-day pg_cron retention
-- 5. public.active_sessions table
-- 6. Add 2FA and session metadata columns to public.profiles

-- 1. STANDARDIZE SETTINGS MEETING_TIME AS POSTGRES TIME COLUMN
alter table public.settings drop constraint if exists check_meeting_time_valid;

alter table public.settings
  alter column meeting_time drop default;

alter table public.settings
  alter column meeting_time type time without time zone
  using (
    case
      when meeting_time is null then '10:00:00'::time
      when meeting_time::text ~* 'AM|PM' then (to_timestamp(meeting_time::text, 'HH12:MI AM'))::time
      else meeting_time::text::time
    end
  );

alter table public.settings
  alter column meeting_time set default '10:00:00'::time;

alter table public.settings
  add constraint check_meeting_time_valid
  check (meeting_time >= '00:00:00'::time and meeting_time <= '23:59:59'::time);

-- 2. PROFILE METADATA & 2FA COLUMNS
alter table public.profiles
  add column if not exists mfa_enabled boolean not null default false,
  add column if not exists mfa_enrolled_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_device_browser text;

-- 3. DATABASE LOCKOUT PROTECTION TRIGGER
-- Rules:
-- 1. The last remaining super admin cannot be demoted or deactivated.
-- 2. An admin cannot remove their own admin status.
-- Enforced strictly in PostgreSQL, impossible to bypass.
create or replace function public.enforce_super_admin_lockout_protection()
returns trigger as $$
declare
  v_active_admin_count int;
  v_current_user_id uuid;
begin
  if (OLD.is_super_admin = true and OLD.status = 'active') then
    if (NEW.is_super_admin = false or NEW.status != 'active') then
      -- Check 1: Admin cannot remove their own admin status
      v_current_user_id := auth.uid();
      if v_current_user_id is not null and v_current_user_id = OLD.id then
        raise exception 'Lockout Protection: An admin cannot remove their own admin status.';
      end if;

      -- Check 2: Cannot demote or deactivate the last remaining super admin
      select count(*) into v_active_admin_count
      from public.profiles
      where is_super_admin = true and status = 'active' and id != OLD.id;

      if v_active_admin_count = 0 then
        raise exception 'Lockout Protection: The last remaining super admin cannot be demoted or deactivated.';
      end if;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trigger_enforce_super_admin_lockout on public.profiles;
create trigger trigger_enforce_super_admin_lockout
before update on public.profiles
for each row
execute function public.enforce_super_admin_lockout_protection();

-- 4. LOGIN LOGS TABLE (IP hashed / truncated, 90-day retention)
create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  status text not null check (status in ('success', 'failed')),
  ip_hash text not null,
  user_agent text,
  device_browser text,
  failure_reason text,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.login_logs enable row level security;

-- Super admins can view login logs
drop policy if exists "Super admins can view login logs" on public.login_logs;
create policy "Super admins can view login logs"
  on public.login_logs
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_super_admin = true and status = 'active'
    )
  );

-- Service role and public auth routes can insert login logs
drop policy if exists "Service role can insert login logs" on public.login_logs;
create policy "Service role can insert login logs"
  on public.login_logs
  for insert
  with check (true);

-- Schedule 90-day login log deletion via pg_cron
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cleanup-login-logs');
    perform cron.schedule(
      'cleanup-login-logs',
      '0 3 * * *',
      'delete from public.login_logs where created_at < timezone(''utc''::text, now()) - interval ''90 days'';'
    );
  end if;
exception
  when others then null;
end;
$$;

-- 5. ACTIVE SESSIONS TABLE
create table if not exists public.active_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  device_browser text not null,
  ip_hash text not null,
  last_active_at timestamptz not null default timezone('utc'::text, now()),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.active_sessions enable row level security;

-- Super admins can view all sessions; users can view their own
drop policy if exists "Users and super admins can view active sessions" on public.active_sessions;
create policy "Users and super admins can view active sessions"
  on public.active_sessions
  for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_super_admin = true and status = 'active'
    )
  );

-- 6. ATOMIC FAIL-CLOSED ADMIN ACTIONS (Action and Audit row commit in the SAME transaction)

-- 6A. Approve Member
create or replace function public.admin_approve_member(
  p_admin_id uuid,
  p_member_id uuid,
  p_role_title text,
  p_role_type text,
  p_is_super_admin boolean,
  p_is_treasurer boolean
)
returns jsonb as $$
declare
  v_old_profile public.profiles%rowtype;
begin
  select * into v_old_profile from public.profiles where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.';
  end if;

  update public.profiles
  set status = 'active',
      active = true,
      role_title = p_role_title,
      role_type = p_role_type,
      is_super_admin = coalesce(p_is_super_admin, false),
      is_treasurer = coalesce(p_is_treasurer, false),
      updated_at = timezone('utc'::text, now())
  where id = p_member_id;

  -- Fail closed: if audit insert fails, transaction aborts
  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'approve_member',
    jsonb_build_object(
      'member_id', p_member_id,
      'role_title', p_role_title,
      'role_type', p_role_type,
      'is_super_admin', p_is_super_admin,
      'is_treasurer', p_is_treasurer,
      'previous_status', v_old_profile.status
    )
  );

  return jsonb_build_object('success', true, 'message', 'Member approved successfully.');
end;
$$ language plpgsql security definer;

-- 6B. Reject Member
create or replace function public.admin_reject_member(
  p_admin_id uuid,
  p_member_id uuid
)
returns jsonb as $$
begin
  update public.profiles
  set status = 'deactivated',
      active = false,
      updated_at = timezone('utc'::text, now())
  where id = p_member_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'reject_member',
    jsonb_build_object('member_id', p_member_id)
  );

  return jsonb_build_object('success', true, 'message', 'Member registration rejected.');
end;
$$ language plpgsql security definer;

-- 6C. Update User Role, Flags, and Status
create or replace function public.admin_update_user(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_role_title text,
  p_role_type text,
  p_status text,
  p_is_super_admin boolean,
  p_is_treasurer boolean
)
returns jsonb as $$
declare
  v_old public.profiles%rowtype;
begin
  select * into v_old from public.profiles where id = p_target_user_id for update;
  if not found then
    raise exception 'User not found.';
  end if;

  update public.profiles
  set role_title = coalesce(p_role_title, role_title),
      role_type = coalesce(p_role_type, role_type),
      status = coalesce(p_status, status),
      active = (coalesce(p_status, status) = 'active'),
      is_super_admin = coalesce(p_is_super_admin, is_super_admin),
      is_treasurer = coalesce(p_is_treasurer, is_treasurer),
      updated_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'update_user',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'previous_values', jsonb_build_object(
        'role_title', v_old.role_title,
        'role_type', v_old.role_type,
        'status', v_old.status,
        'is_super_admin', v_old.is_super_admin,
        'is_treasurer', v_old.is_treasurer
      ),
      'new_values', jsonb_build_object(
        'role_title', coalesce(p_role_title, v_old.role_title),
        'role_type', coalesce(p_role_type, v_old.role_type),
        'status', coalesce(p_status, v_old.status),
        'is_super_admin', coalesce(p_is_super_admin, v_old.is_super_admin),
        'is_treasurer', coalesce(p_is_treasurer, v_old.is_treasurer)
      )
    )
  );

  return jsonb_build_object('success', true, 'message', 'User updated successfully.');
end;
$$ language plpgsql security definer;

-- 6D. Deactivate User
create or replace function public.admin_deactivate_user(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb as $$
declare
  v_old_status text;
begin
  select status into v_old_status from public.profiles where id = p_target_user_id for update;

  update public.profiles
  set status = 'deactivated',
      active = false,
      updated_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  -- Invalidate all active sessions for this user
  delete from public.active_sessions where user_id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'deactivate_user',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'previous_status', v_old_status,
      'new_status', 'deactivated'
    )
  );

  return jsonb_build_object('success', true, 'message', 'User deactivated successfully.');
end;
$$ language plpgsql security definer;

-- 6E. Reactivate User
create or replace function public.admin_reactivate_user(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb as $$
declare
  v_old_status text;
begin
  select status into v_old_status from public.profiles where id = p_target_user_id for update;

  update public.profiles
  set status = 'active',
      active = true,
      updated_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'reactivate_user',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'previous_status', v_old_status,
      'new_status', 'active'
    )
  );

  return jsonb_build_object('success', true, 'message', 'User reactivated successfully.');
end;
$$ language plpgsql security definer;

-- 6F. Sign Out User Everywhere
create or replace function public.admin_sign_out_user(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb as $$
begin
  delete from public.active_sessions where user_id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'sign_out_everywhere',
    jsonb_build_object('target_user_id', p_target_user_id)
  );

  return jsonb_build_object('success', true, 'message', 'User signed out everywhere.');
end;
$$ language plpgsql security definer;

-- 6G. Reset 2FA Factor (Admin Recovery Path)
create or replace function public.admin_reset_user_2fa(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb as $$
begin
  -- An admin cannot reset their own 2FA (must be performed by a second super admin)
  if p_admin_id = p_target_user_id then
    raise exception 'Recovery protection: An admin cannot reset their own 2FA factor. Must be performed by another super admin.';
  end if;

  update public.profiles
  set mfa_enabled = false,
      mfa_enrolled_at = null,
      updated_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'reset_2fa',
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'recovered_by_admin', p_admin_id
    )
  );

  return jsonb_build_object('success', true, 'message', 'User 2FA reset successfully.');
end;
$$ language plpgsql security definer;

-- 6H. Force Password Reset Trigger Logging
create or replace function public.admin_force_password_reset(
  p_admin_id uuid,
  p_target_user_id uuid
)
returns jsonb as $$
begin
  update public.profiles
  set must_change_password = true,
      updated_at = timezone('utc'::text, now())
  where id = p_target_user_id;

  insert into public.audit_logs (user_id, action, details)
  values (
    p_admin_id,
    'force_password_reset',
    jsonb_build_object('target_user_id', p_target_user_id)
  );

  return jsonb_build_object('success', true, 'message', 'Password reset triggered successfully.');
end;
$$ language plpgsql security definer;

-- >>> END MIGRATION: 20261101000011_phase4_super_admin_security.sql <<<

-- >>> START MIGRATION: 20261101000012_phase4_hardening.sql <<<
-- Migration: Phase 4 Security Hardening
-- 1. Server-side AAL2 enforcement for super admins (Functions, Stored Procedures & Restrictive RLS)
-- 2. Column-level privilege restrictions and trigger protection on public.profiles
-- 3. Real session revocation procedure in auth schema
-- 4. Fail-closed AAL2 checks on all administrative mutations

-- 1. FUNCTION TO CHECK IF CALLER HAS ACTIVE AAL2 SESSION (MFA VERIFIED)
create or replace function public.is_aal2_super_admin()
returns boolean
language plpgsql
security definer
as $$
declare
  v_uid uuid;
  v_is_sa boolean;
  v_aal text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    -- If called by service_role, allow
    if current_user = 'service_role' or coalesce((auth.jwt()->>'role'), '') = 'service_role' then
      return true;
    end if;
    return false;
  end if;

  select is_super_admin into v_is_sa
  from public.profiles
  where id = v_uid;

  if v_is_sa is distinct from true then
    return false;
  end if;

  v_aal := coalesce((auth.jwt()->>'aal'), 'aal1');
  return v_aal = 'aal2';
end;
$$;

-- 2. RESTRICTIVE RLS POLICIES REQUIRING AAL2 FOR SUPER ADMIN DATA ACCESS
drop policy if exists "Super admins require AAL2 to view login logs" on public.login_logs;
create policy "Super admins require AAL2 to view login logs"
  on public.login_logs
  as restrictive
  to authenticated
  using (
    not exists (
      select 1 from public.profiles where id = auth.uid() and is_super_admin = true
    )
    or ((select auth.jwt()->>'aal') = 'aal2')
  );

drop policy if exists "Super admins require AAL2 to view active sessions" on public.active_sessions;
create policy "Super admins require AAL2 to view active sessions"
  on public.active_sessions
  as restrictive
  to authenticated
  using (
    not exists (
      select 1 from public.profiles where id = auth.uid() and is_super_admin = true
    )
    or ((select auth.jwt()->>'aal') = 'aal2')
  );

drop policy if exists "Super admins require AAL2 to view audit logs" on public.audit_logs;
create policy "Super admins require AAL2 to view audit logs"
  on public.audit_logs
  as restrictive
  to authenticated
  using (
    not exists (
      select 1 from public.profiles where id = auth.uid() and is_super_admin = true
    )
    or ((select auth.jwt()->>'aal') = 'aal2')
  );

drop policy if exists "Super admins require AAL2 for profile administration" on public.profiles;
create policy "Super admins require AAL2 for profile administration"
  on public.profiles
  as restrictive
  to authenticated
  using (
    not exists (
      select 1 from public.profiles where id = auth.uid() and is_super_admin = true
    )
    or ((select auth.jwt()->>'aal') = 'aal2')
  );

-- 3. COLUMN PRIVILEGES & TRIGGER GUARD ON PUBLIC.PROFILES
-- Prevent normal members from writing system/admin columns on their own profile
alter table public.profiles add column if not exists avatar_url text;
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar, updated_at) on public.profiles to authenticated;
grant update (avatar_url) on public.profiles to authenticated;

create or replace function public.check_profile_column_permissions()
returns trigger
language plpgsql
security definer
as $$
declare
  v_is_super_admin boolean;
  v_aal text;
begin
  -- Service role is unrestricted
  if current_user = 'service_role' or coalesce((auth.jwt()->>'role'), '') = 'service_role' then
    return new;
  end if;

  -- Check if caller is super admin with AAL2
  v_is_super_admin := coalesce((select is_super_admin from public.profiles where id = auth.uid()), false);
  v_aal := coalesce((auth.jwt()->>'aal'), 'aal1');

  if v_is_super_admin and v_aal = 'aal2' then
    return new;
  end if;

  -- Normal member or non-AAL2 user attempting to modify protected system columns
  if (old.last_login_at is distinct from new.last_login_at) or
     (old.last_device_browser is distinct from new.last_device_browser) or
     (old.mfa_enabled is distinct from new.mfa_enabled) or
     (old.mfa_enrolled_at is distinct from new.mfa_enrolled_at) or
     (old.status is distinct from new.status) or
     (old.active is distinct from new.active) or
     (old.role_title is distinct from new.role_title) or
     (old.role_type is distinct from new.role_type) or
     (old.is_super_admin is distinct from new.is_super_admin) or
     (old.is_treasurer is distinct from new.is_treasurer) or
     (old.weekly_target_xp is distinct from new.weekly_target_xp) then
    raise exception 'Forbidden: Members are not permitted to modify system columns (role, status, admin flags, MFA, login metadata, or target).'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_protect_profile_system_columns on public.profiles;
create trigger trigger_protect_profile_system_columns
  before update on public.profiles
  for each row
  execute function public.check_profile_column_permissions();

-- 4. REAL SUPABASE AUTH SESSION REVOCATION STORED PROCEDURE
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Revoke sessions from Supabase Auth schema
  begin
    delete from auth.refresh_tokens
    where session_id in (select id from auth.sessions where user_id = p_user_id);

    delete from auth.sessions
    where user_id = p_user_id;
  exception
    when undefined_table then
      -- auth schema tables not present in standard local test runner
      null;
  end;

  -- Clear active_sessions tracking table
  delete from public.active_sessions
  where user_id = p_user_id;
end;
$$;

-- 5. UPDATE STORED PROCEDURES TO ENFORCE AAL2 FOR SUPER ADMINS
drop function if exists public.admin_update_user(uuid, uuid, text, text, text, boolean, boolean);
drop function if exists public.admin_update_user(uuid, uuid, text, text, boolean, boolean, text);
drop function if exists public.admin_update_user;
create or replace function public.admin_update_user(
  p_admin_id uuid,
  p_target_id uuid,
  p_role_title text default null,
  p_role_type text default null,
  p_is_super_admin boolean default null,
  p_is_treasurer boolean default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin public.profiles%rowtype;
  v_old_target public.profiles%rowtype;
  v_new_target public.profiles%rowtype;
  v_active_sa_count int;
  v_audit_id uuid;
begin
  -- Enforce AAL2 for Super Admins
  if not public.is_aal2_super_admin() and current_user != 'service_role' and coalesce((auth.jwt()->>'role'), '') != 'service_role' then
    raise exception 'Forbidden: Super admin database operations require an active AAL2 session (MFA verified).'
      using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.is_super_admin != true or v_admin.status != 'active' then
    raise exception 'Unauthorized: Only active super admins can modify team member roles and flags.';
  end if;

  select * into v_old_target from public.profiles where id = p_target_id;
  if not found then
    raise exception 'User not found.';
  end if;

  if (p_admin_id = p_target_id) and (p_is_super_admin = false or (p_status is not null and p_status != 'active')) then
    raise exception 'Lockout Protection: An admin cannot remove their own admin status.';
  end if;

  if (v_old_target.is_super_admin = true and v_old_target.status = 'active') then
    if (p_is_super_admin = false or (p_status is not null and p_status != 'active')) then
      select count(*) into v_active_sa_count
      from public.profiles
      where is_super_admin = true and status = 'active' and id != p_target_id;

      if v_active_sa_count = 0 then
        raise exception 'Lockout Protection: The last remaining super admin cannot be demoted or deactivated.';
      end if;
    end if;
  end if;

  update public.profiles
  set
    role_title = coalesce(p_role_title, role_title),
    role_type = coalesce(p_role_type, role_type),
    is_super_admin = coalesce(p_is_super_admin, is_super_admin),
    is_treasurer = coalesce(p_is_treasurer, is_treasurer),
    status = coalesce(p_status, status),
    active = case when coalesce(p_status, status) = 'active' then true else false end,
    updated_at = now()
  where id = p_target_id
  returning * into v_new_target;

  -- If deactivated, revoke real sessions
  if v_new_target.status = 'deactivated' then
    perform public.admin_revoke_user_sessions(p_target_id);
  end if;

  insert into public.audit_logs (user_id, action, details, created_at)
  values (
    p_admin_id,
    'update_user',
    jsonb_build_object(
      'target_user_id', p_target_id,
      'previous', jsonb_build_object(
        'role_title', v_old_target.role_title,
        'role_type', v_old_target.role_type,
        'is_super_admin', v_old_target.is_super_admin,
        'is_treasurer', v_old_target.is_treasurer,
        'status', v_old_target.status
      ),
      'new', jsonb_build_object(
        'role_title', v_new_target.role_title,
        'role_type', v_new_target.role_type,
        'is_super_admin', v_new_target.is_super_admin,
        'is_treasurer', v_new_target.is_treasurer,
        'status', v_new_target.status
      )
    ),
    now()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'user', to_jsonb(v_new_target),
    'audit_log_id', v_audit_id
  );
end;
$$;

drop function if exists public.admin_sign_out_user(uuid, uuid);
drop function if exists public.admin_sign_out_user;
create or replace function public.admin_sign_out_user(
  p_admin_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_audit_id uuid;
begin
  if not public.is_aal2_super_admin() and current_user != 'service_role' and coalesce((auth.jwt()->>'role'), '') != 'service_role' then
    raise exception 'Forbidden: Super admin database operations require an active AAL2 session (MFA verified).'
      using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.is_super_admin != true or v_admin.status != 'active' then
    raise exception 'Unauthorized: Only active super admins can sign out users.';
  end if;

  select * into v_target from public.profiles where id = p_target_id;
  if not found then
    raise exception 'Target user not found.';
  end if;

  -- Revoke real sessions and refresh tokens
  perform public.admin_revoke_user_sessions(p_target_id);

  insert into public.audit_logs (user_id, action, details, created_at)
  values (
    p_admin_id,
    'sign_out_everywhere',
    jsonb_build_object(
      'target_user_id', p_target_id,
      'target_email', (select email from auth.users where id = p_target_id)
    ),
    now()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'message', 'User signed out everywhere and all sessions revoked.',
    'audit_log_id', v_audit_id
  );
end;
$$;

drop function if exists public.admin_force_password_reset(uuid, uuid);
drop function if exists public.admin_force_password_reset;
create or replace function public.admin_force_password_reset(
  p_admin_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_audit_id uuid;
begin
  if not public.is_aal2_super_admin() and current_user != 'service_role' and coalesce((auth.jwt()->>'role'), '') != 'service_role' then
    raise exception 'Forbidden: Super admin database operations require an active AAL2 session (MFA verified).'
      using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.is_super_admin != true or v_admin.status != 'active' then
    raise exception 'Unauthorized: Only active super admins can force password reset.';
  end if;

  select * into v_target from public.profiles where id = p_target_id;
  if not found then
    raise exception 'Target user not found.';
  end if;

  -- Revoke existing sessions immediately on forced password reset
  perform public.admin_revoke_user_sessions(p_target_id);

  insert into public.audit_logs (user_id, action, details, created_at)
  values (
    p_admin_id,
    'force_password_reset',
    jsonb_build_object(
      'target_user_id', p_target_id
    ),
    now()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Password reset initiated and all existing sessions revoked.',
    'audit_log_id', v_audit_id
  );
end;
$$;

drop function if exists public.admin_reset_user_2fa(uuid, uuid);
drop function if exists public.admin_reset_user_2fa;
create or replace function public.admin_reset_user_2fa(
  p_admin_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin public.profiles%rowtype;
  v_target public.profiles%rowtype;
  v_audit_id uuid;
begin
  if not public.is_aal2_super_admin() and current_user != 'service_role' and coalesce((auth.jwt()->>'role'), '') != 'service_role' then
    raise exception 'Forbidden: Super admin database operations require an active AAL2 session (MFA verified).'
      using errcode = '42501';
  end if;

  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.is_super_admin != true or v_admin.status != 'active' then
    raise exception 'Unauthorized: Only active super admins can reset 2FA.';
  end if;

  -- Recovery path requires a SECOND super admin (cannot reset own 2FA)
  if p_admin_id = p_target_id then
    raise exception 'Recovery Restriction: A super admin cannot remove their own 2FA factor. Another active super admin is required.';
  end if;

  select * into v_target from public.profiles where id = p_target_id;
  if not found then
    raise exception 'Target user not found.';
  end if;

  update public.profiles
  set
    mfa_enabled = false,
    mfa_enrolled_at = null,
    updated_at = now()
  where id = p_target_id;

  -- Delete TOTP factors in Supabase Auth
  begin
    delete from auth.mfa_factors where user_id = p_target_id;
  exception
    when undefined_table then null;
  end;

  -- Revoke sessions so user must log in and re-enroll 2FA
  perform public.admin_revoke_user_sessions(p_target_id);

  insert into public.audit_logs (user_id, action, details, created_at)
  values (
    p_admin_id,
    'reset_2fa',
    jsonb_build_object(
      'target_user_id', p_target_id,
      'previous_mfa_enabled', v_target.mfa_enabled,
      'new_mfa_enabled', false
    ),
    now()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'success', true,
    'message', 'User 2FA factor removed and sessions revoked. User must re-enroll on next login.',
    'audit_log_id', v_audit_id
  );
end;
$$;

-- >>> END MIGRATION: 20261101000012_phase4_hardening.sql <<<

-- >>> START MIGRATION: 20261101000013_session_revocation_db_check.sql <<<
-- Migration: 20261101000013_session_revocation_db_check.sql
-- Enforces database-backed session validation, RLS session checks on sensitive tables,
-- caller authorization on admin_revoke_user_sessions, and profiles.sessions_revoked_before timestamp.

-- 1. ADD sessions_revoked_before TIMESTAMP TO PROFILES
alter table public.profiles
  add column if not exists sessions_revoked_before timestamptz default null;

-- 2. DATABASE SESSION VALIDATION FUNCTIONS
create or replace function public.is_session_active(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.sessions
    where id = p_session_id
  );
$$;

create or replace function public.is_current_session_active()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.sessions
    where id = nullif(current_setting('request.jwt.claim.session_id', true), '')::uuid
       or id = nullif(auth.jwt()->>'session_id', '')::uuid
  );
$$;

-- Function to check session validity from backend APIs (checks auth.sessions, active_sessions, and sessions_revoked_before)
create or replace function public.check_session_validity(
  p_session_id text default null,
  p_user_id uuid default null,
  p_token_issued_at timestamptz default null
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_session_uuid uuid;
  v_session_found boolean := false;
  v_revoked_before timestamptz;
begin
  -- If user_id provided, check if profile has a sessions_revoked_before cut-off
  if p_user_id is not null then
    select sessions_revoked_before into v_revoked_before
    from public.profiles
    where id = p_user_id;

    if v_revoked_before is not null and p_token_issued_at is not null and p_token_issued_at <= v_revoked_before then
      return false;
    end if;
  end if;

  -- If session_id provided, verify existence in auth.sessions
  if p_session_id is not null and p_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_session_uuid := p_session_id::uuid;
    begin
      select exists (
        select 1 from auth.sessions
        where id = v_session_uuid and (p_user_id is null or user_id = p_user_id)
      ) into v_session_found;
      
      if not v_session_found then
        return false;
      end if;
    exception
      when undefined_table then
        -- In mock or non-auth test environment, fallback to active_sessions
        null;
    end;
  end if;

  -- Verify in active_sessions table
  if p_session_id is not null then
    select exists (
      select 1 from public.active_sessions
      where session_id = p_session_id and (p_user_id is null or user_id = p_user_id)
    ) into v_session_found;

    -- If active_sessions tracks this user, confirm it is present
    if not v_session_found and exists (select 1 from public.active_sessions where user_id = p_user_id) then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- 3. RESTRICT admin_revoke_user_sessions CALLER TO AAL2 SUPER ADMIN OR SERVICE ROLE
create or replace function public.admin_revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := auth.role();
  v_is_aal2 boolean;
begin
  -- Enforce: MUST be service_role OR an AAL2 super admin
  if v_role <> 'service_role' then
    v_is_aal2 := public.is_aal2_super_admin();
    if not coalesce(v_is_aal2, false) then
      raise exception 'Unauthorized: admin_revoke_user_sessions can only be executed by an AAL2 super admin or the service role';
    end if;
  end if;

  -- 1. Revoke sessions from Supabase Auth schema
  begin
    delete from auth.refresh_tokens
    where session_id in (select id from auth.sessions where user_id = p_user_id);

    delete from auth.sessions
    where user_id = p_user_id;
  exception
    when undefined_table then
      null;
  end;

  -- 2. Clear application active_sessions tracking table
  delete from public.active_sessions
  where user_id = p_user_id;

  -- 3. Update profile sessions_revoked_before timestamp
  update public.profiles
  set sessions_revoked_before = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where id = p_user_id;
end;
$$;

-- Explicitly revoke permissions from anon and public, grant to service_role and authenticated
revoke all on function public.admin_revoke_user_sessions(uuid) from public;
revoke all on function public.admin_revoke_user_sessions(uuid) from anon;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;
grant execute on function public.admin_revoke_user_sessions(uuid) to authenticated;

grant execute on function public.is_session_active(uuid) to service_role;
grant execute on function public.is_session_active(uuid) to authenticated;
grant execute on function public.is_current_session_active() to service_role;
grant execute on function public.is_current_session_active() to authenticated;
grant execute on function public.check_session_validity(text, uuid, timestamptz) to service_role;
grant execute on function public.check_session_validity(text, uuid, timestamptz) to authenticated;

-- 4. RLS POLICIES ON SENSITIVE TABLES BLOCKING REVOKED SESSIONS
-- public.active_sessions: Must have an active session
drop policy if exists "Super admins require AAL2 to view active sessions" on public.active_sessions;
create policy "Super admins require AAL2 to view active sessions"
  on public.active_sessions
  for select
  using (
    (
      public.is_aal2_super_admin() or
      user_id = auth.uid()
    )
    and (
      -- If JWT contains a session_id, it must exist in auth.sessions
      nullif(auth.jwt()->>'session_id', '') is null or
      public.is_current_session_active()
    )
  );

-- public.login_logs: Sensitive table - enforce session validity
drop policy if exists "Super admins require AAL2 to view login logs" on public.login_logs;
create policy "Super admins require AAL2 to view login logs"
  on public.login_logs
  for select
  using (
    public.is_aal2_super_admin()
    and (
      nullif(auth.jwt()->>'session_id', '') is null or
      public.is_current_session_active()
    )
  );

-- public.audit_logs: Sensitive table - enforce session validity
drop policy if exists "Super admins require AAL2 to read audit logs" on public.audit_logs;
create policy "Super admins require AAL2 to read audit logs"
  on public.audit_logs
  for select
  using (
    public.is_aal2_super_admin()
    and (
      nullif(auth.jwt()->>'session_id', '') is null or
      public.is_current_session_active()
    )
  );

-- >>> END MIGRATION: 20261101000013_session_revocation_db_check.sql <<<
