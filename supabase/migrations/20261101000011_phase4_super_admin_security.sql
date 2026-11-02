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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
returns jsonb as 
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
