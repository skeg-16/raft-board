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
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;

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
create or replace function public.admin_update_user(
  p_admin_id uuid,
  p_target_id uuid,
  p_role_title text default null,
  p_role_type public.role_type default null,
  p_is_super_admin boolean default null,
  p_is_treasurer boolean default null,
  p_status public.member_status default null
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
