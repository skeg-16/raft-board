-- ==============================================================================
-- Raft Board: Seed Data
-- 6 Team Members for Otter Software Systems (OSS)
-- Password for all seed users: OtterPass2026!
-- ==============================================================================

create extension if not exists "pgcrypto";

do $$
declare
  -- Define consistent deterministic UUIDs for the 6 seed members
  coo_id uuid := '11111111-1111-4111-a111-111111111111';
  cto_id uuid := '22222222-2222-4222-a222-222222222222';
  cmo_id uuid := '33333333-3333-4333-a333-333333333333';
  creatives_id uuid := '44444444-4444-4444-a444-444444444444';
  backend_id uuid := '55555555-5555-4555-a555-555555555555';
  ops_id uuid := '66666666-6666-4666-a666-666666666666';

  default_password_hash text := crypt('OtterPass2026!', gen_salt('bf', 10));
begin
  -- 1. Insert into auth.users (if not already present)
  insert into auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, role, aud,
    created_at, updated_at
  )
  values
    (
      coo_id, '00000000-0000-0000-0000-000000000000', 'coo@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Samira Chen","role_title":"Chief Operating Officer"}',
      false, 'authenticated', 'authenticated', now(), now()
    ),
    (
      cto_id, '00000000-0000-0000-0000-000000000000', 'cto@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Alex Rivera","role_title":"Chief Technology Officer"}',
      false, 'authenticated', 'authenticated', now(), now()
    ),
    (
      cmo_id, '00000000-0000-0000-0000-000000000000', 'cmo@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Marcus Vance","role_title":"Chief Marketing Officer"}',
      false, 'authenticated', 'authenticated', now(), now()
    ),
    (
      creatives_id, '00000000-0000-0000-0000-000000000000', 'creatives@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Chloe Santos","role_title":"Creatives Lead"}',
      false, 'authenticated', 'authenticated', now(), now()
    ),
    (
      backend_id, '00000000-0000-0000-0000-000000000000', 'backend@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"David Kim","role_title":"Backend Lead"}',
      false, 'authenticated', 'authenticated', now(), now()
    ),
    (
      ops_id, '00000000-0000-0000-0000-000000000000', 'operations@otter.systems',
      default_password_hash, now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Bea Alcantara","role_title":"Operations Lead"}',
      false, 'authenticated', 'authenticated', now(), now()
    )
  on conflict (id) do nothing;

  -- 2. Insert into public.profiles
  insert into public.profiles (
    id, full_name, role_title, role_type, is_super_admin, is_treasurer,
    weekly_target_xp, avatar, active, must_change_password
  )
  values
    (
      coo_id, 'Samira Chen', 'Chief Operating Officer', 'executive',
      true,  -- super_admin backup
      true,  -- treasurer
      80, null, true, true
    ),
    (
      cto_id, 'Alex Rivera', 'Chief Technology Officer', 'executive',
      true,  -- super_admin primary
      false,
      80, null, true, true
    ),
    (
      cmo_id, 'Marcus Vance', 'Chief Marketing Officer', 'executive',
      false, false, 80, null, true, true
    ),
    (
      creatives_id, 'Chloe Santos', 'Creatives Lead', 'lead',
      false, false, 80, null, true, true
    ),
    (
      backend_id, 'David Kim', 'Backend Lead', 'lead',
      false, false, 80, null, true, true
    ),
    (
      ops_id, 'Bea Alcantara', 'Operations Lead', 'lead',
      false, false, 80, null, true, true
    )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role_title = excluded.role_title,
    role_type = excluded.role_type,
    is_super_admin = excluded.is_super_admin,
    is_treasurer = excluded.is_treasurer,
    weekly_target_xp = excluded.weekly_target_xp;
end;
$$;
