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
