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
