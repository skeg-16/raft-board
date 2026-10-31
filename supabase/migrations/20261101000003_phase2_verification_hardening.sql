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
