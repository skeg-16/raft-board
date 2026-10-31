-- ==============================================================================
-- Raft Board: Migration 20261031000004
-- Automated Verification Script for Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor to verify RLS policies
-- ==============================================================================

do $$
declare
  v_pending_user_id uuid := 'aaaaaaaa-1111-4111-a111-111111111111';
  v_active_user_id  uuid := 'bbbbbbbb-2222-4222-a222-222222222222';
  v_superadmin_id   uuid := 'cccccccc-3333-4333-a333-333333333333';
  v_deactivated_id  uuid := 'dddddddd-4444-4444-a444-444444444444';
  
  v_count integer;
  v_updated integer;
begin
  -- 1. Setup Test Fixtures (with temporary profiles)
  insert into public.profiles (id, full_name, role_title, role_type, status, is_super_admin, is_treasurer, active)
  values
    (v_pending_user_id, 'Pending Otter', 'Requested Backend', null, 'pending', false, false, false),
    (v_active_user_id, 'Active Lead Otter', 'Backend Lead', 'lead', 'active', false, false, true),
    (v_superadmin_id, 'Super Admin Otter', 'Chief Technology Officer', 'executive', 'active', true, false, true),
    (v_deactivated_id, 'Deactivated Otter', 'Former Lead', 'lead', 'deactivated', false, false, false)
  on conflict (id) do update set
    status = excluded.status,
    role_type = excluded.role_type,
    is_super_admin = excluded.is_super_admin,
    is_treasurer = excluded.is_treasurer,
    active = excluded.active;

  -- ============================================================================
  -- TEST SUITE 1: PENDING USER PERMISSIONS (auth.uid = v_pending_user_id)
  -- ============================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_pending_user_id, 'role', 'authenticated')::text, true);

  -- 1.1 Pending user cannot read other team member profiles
  select count(*) into v_count from public.profiles where id != v_pending_user_id;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Pending user was able to read % other profiles!', v_count;
  end if;

  -- 1.2 Pending user can only read their own profile
  select count(*) into v_count from public.profiles;
  if v_count != 1 then
    raise exception 'RLS FAILURE: Expected pending user to read only 1 profile (their own), got %', v_count;
  end if;

  -- 1.3 Pending user cannot read system settings
  select count(*) into v_count from public.settings;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Pending user was able to read settings!';
  end if;

  -- 1.4 Pending user CANNOT self-promote status to active
  update public.profiles set status = 'active' where id = v_pending_user_id;
  select status into v_count from public.profiles where id = v_pending_user_id and status = 'active';
  if v_count is not null then
    raise exception 'RLS FAILURE: Pending user successfully self-promoted to active!';
  end if;

  -- 1.5 Pending user CANNOT grant themselves super_admin
  update public.profiles set is_super_admin = true where id = v_pending_user_id;
  select count(*) into v_count from public.profiles where id = v_pending_user_id and is_super_admin = true;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Pending user successfully granted themselves is_super_admin!';
  end if;

  -- ============================================================================
  -- TEST SUITE 2: ACTIVE USER (NON-ADMIN) PERMISSIONS (auth.uid = v_active_user_id)
  -- ============================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_active_user_id, 'role', 'authenticated')::text, true);

  -- 2.1 Active user can read active profiles but NOT pending profiles of others
  select count(*) into v_count from public.profiles where status = 'pending' and id != v_active_user_id;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Active non-admin was able to read pending profiles!';
  end if;

  -- 2.2 Active user CAN read system settings
  select count(*) into v_count from public.settings;
  if v_count = 0 then
    raise exception 'RLS FAILURE: Active user was blocked from reading settings!';
  end if;

  -- 2.3 Privilege Escalation Attack: Active user tries to set is_super_admin = true
  update public.profiles set is_super_admin = true where id = v_active_user_id;
  select count(*) into v_count from public.profiles where id = v_active_user_id and is_super_admin = true;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Active user successfully escalated to is_super_admin!';
  end if;

  -- 2.4 Privilege Escalation Attack: Active user tries to set is_treasurer = true
  update public.profiles set is_treasurer = true where id = v_active_user_id;
  select count(*) into v_count from public.profiles where id = v_active_user_id and is_treasurer = true;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Active user successfully escalated to is_treasurer!';
  end if;

  -- 2.5 Privilege Escalation Attack: Active user tries to change role_type to executive
  update public.profiles set role_type = 'executive' where id = v_active_user_id;
  select count(*) into v_count from public.profiles where id = v_active_user_id and role_type = 'executive';
  if v_count > 0 then
    raise exception 'RLS FAILURE: Active lead user successfully promoted own role_type to executive!';
  end if;

  -- 2.6 Active user CAN update safe non-privileged fields (e.g., avatar)
  update public.profiles set avatar = 'https://example.com/avatar.png' where id = v_active_user_id;
  select count(*) into v_count from public.profiles where id = v_active_user_id and avatar = 'https://example.com/avatar.png';
  if v_count = 0 then
    raise exception 'RLS FAILURE: Active user was blocked from updating non-privileged fields (avatar)!';
  end if;

  -- ============================================================================
  -- TEST SUITE 3: DEACTIVATED USER PERMISSIONS (auth.uid = v_deactivated_id)
  -- ============================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_deactivated_id, 'role', 'authenticated')::text, true);

  -- 3.1 Deactivated user cannot read active profiles of others
  select count(*) into v_count from public.profiles where id != v_deactivated_id;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Deactivated user was able to read active profiles!';
  end if;

  -- 3.2 Deactivated user cannot read settings
  select count(*) into v_count from public.settings;
  if v_count > 0 then
    raise exception 'RLS FAILURE: Deactivated user was able to read settings!';
  end if;

  -- Clean up test fixtures
  delete from public.profiles where id in (v_pending_user_id, v_active_user_id, v_superadmin_id, v_deactivated_id);

  raise notice '🎉 ALL RLS TESTS PASSED SUCCESSFULLY! Row Level Security is verified and secure.';
end;
$$;
