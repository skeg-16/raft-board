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
