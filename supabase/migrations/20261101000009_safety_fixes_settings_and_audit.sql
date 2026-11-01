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
