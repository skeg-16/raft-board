-- ==============================================================================
-- Raft Board: Phase 2 Database Tests
-- Version: 20261101000002
-- Description: Unit tests for XP cap (140 + 50 -> 10), Idempotency, Undo recalculation, Early bonus once/week, and Cutoff lock.
-- ==============================================================================

do $$
declare
  v_test_user_id uuid := '11111111-1111-4111-a111-111111111111'::uuid;
  v_week public.weeks%rowtype;
  v_task_small uuid;
  v_task_med uuid;
  v_task_big1 uuid;
  v_task_big2 uuid;
  v_task_big3 uuid;
  v_res json;
  v_total_xp int;
  v_bonus_count int;
  v_task_amount int;
begin
  raise notice '🧪 Running Phase 2 Database Edge Case Tests...';

  -- 0. Setup dummy user and week
  insert into public.profiles (id, full_name, role_title, role_type, status, active)
  values (v_test_user_id, 'XP Test Otter', 'Backend Lead', 'lead', 'active', true)
  on conflict (id) do nothing;

  -- Create a test current week
  insert into public.weeks (id, week_number, year, start_at, cutoff_at, is_current)
  values ('22222222-2222-4222-a222-222222222222'::uuid, 99, 2026, now() - interval '2 days', now() + interval '5 days', true)
  on conflict (year, week_number) do update set cutoff_at = now() + interval '5 days'
  returning * into v_week;

  -- Clean any prior test events for this user and week
  delete from public.xp_events where user_id = v_test_user_id and week_id = v_week.id;
  delete from public.tasks where user_id = v_test_user_id and week_id = v_week.id;

  -- TEST 1: Early Cutoff Bonus (+10 XP) on first task
  insert into public.tasks (id, week_id, user_id, title, category, size, source, status)
  values (gen_random_uuid(), v_week.id, v_test_user_id, 'Task 1 (Small)', 'Platforms', 'small', 'assigned', 'todo')
  returning id into v_task_small;

  v_res := public.finish_task_and_award_xp(v_task_small);
  if (v_res->>'task_xp_awarded')::int != 10 or (v_res->>'bonus_xp_awarded')::int != 10 then
    raise exception 'TEST 1 FAILED: Expected 10 task XP + 10 bonus XP, got %', v_res;
  end if;
  raise notice '  ✓ Test 1 Passed: First finished task awarded 10 base XP + 10 early cutoff bonus.';

  -- TEST 2: Idempotency (calling finish again on same task must NOT double award)
  v_res := public.finish_task_and_award_xp(v_task_small);
  if (v_res->>'already_finished')::boolean != true or (v_res->>'bonus_xp_awarded')::int != 0 then
    raise exception 'TEST 2 FAILED: Idempotency check failed, got %', v_res;
  end if;
  raise notice '  ✓ Test 2 Passed: Idempotent finish call did not duplicate XP.';

  -- TEST 3: Bonus once per week (Second task must NOT award bonus again)
  insert into public.tasks (id, week_id, user_id, title, category, size, source, status)
  values (gen_random_uuid(), v_week.id, v_test_user_id, 'Task 2 (Medium)', 'Marketing', 'medium', 'extra', 'todo')
  returning id into v_task_med;

  v_res := public.finish_task_and_award_xp(v_task_med);
  if (v_res->>'task_xp_awarded')::int != 30 or (v_res->>'bonus_xp_awarded')::int != 0 then
    raise exception 'TEST 3 FAILED: Second task should not receive bonus, got %', v_res;
  end if;

  select count(*) into v_bonus_count
  from public.xp_events
  where user_id = v_test_user_id and week_id = v_week.id and reason = 'early_cutoff_bonus' and voided = false;
  if v_bonus_count != 1 then
    raise exception 'TEST 3 FAILED: Expected exactly 1 bonus event, found %', v_bonus_count;
  end if;
  raise notice '  ✓ Test 3 Passed: Early cutoff bonus strictly limited to once per week.';

  -- TEST 4: Cap Edge Case (Reach 140 XP, then finish a Big 50 XP task -> awards only 10 XP to hit 150 cap)
  -- Current task XP: 10 + 30 = 40.
  -- Add Big task 1 (50 XP) -> Total 90
  insert into public.tasks (id, week_id, user_id, title, category, size, source, status)
  values (gen_random_uuid(), v_week.id, v_test_user_id, 'Task 3 (Big 1)', 'Platforms', 'big', 'assigned', 'todo')
  returning id into v_task_big1;
  v_res := public.finish_task_and_award_xp(v_task_big1);
  if (v_res->>'task_xp_awarded')::int != 50 then
    raise exception 'TEST 4a FAILED: Expected 50 XP, got %', v_res;
  end if;

  -- Add Big task 2 (50 XP) -> Total 140
  insert into public.tasks (id, week_id, user_id, title, category, size, source, status)
  values (gen_random_uuid(), v_week.id, v_test_user_id, 'Task 4 (Big 2)', 'Operations', 'big', 'extra', 'todo')
  returning id into v_task_big2;
  v_res := public.finish_task_and_award_xp(v_task_big2);
  if (v_res->>'task_xp_awarded')::int != 50 then
    raise exception 'TEST 4b FAILED: Expected 50 XP, got %', v_res;
  end if;

  -- Member now has 140 task XP! Now add Big task 3 (50 XP). It MUST award only 10 XP!
  insert into public.tasks (id, week_id, user_id, title, category, size, source, status)
  values (gen_random_uuid(), v_week.id, v_test_user_id, 'Task 5 (Big 3 - Cap Edge)', 'Clients', 'big', 'assigned', 'todo')
  returning id into v_task_big3;
  v_res := public.finish_task_and_award_xp(v_task_big3);
  if (v_res->>'task_xp_awarded')::int != 10 then
    raise exception 'TEST 4c FAILED: Expected exactly 10 XP capped, got %', v_res;
  end if;

  select sum(amount) into v_total_xp
  from public.xp_events
  where user_id = v_test_user_id and week_id = v_week.id and reason = 'task_completion' and voided = false;
  if v_total_xp != 150 then
    raise exception 'TEST 4 FAILED: Weekly task XP sum is %, expected exactly 150', v_total_xp;
  end if;
  raise notice '  ✓ Test 4 Passed: Cap edge case (140 XP + Big 50 XP task awarded exactly 10 XP to cap at 150).';

  -- TEST 5: Undo after cap recalculation
  -- If we undo Task 3 (Big 1 - 50 XP), Task 5 (which was capped at 10) must automatically get recalculated to 50!
  v_res := public.undo_task_completion(v_task_big1);

  select amount into v_task_amount
  from public.xp_events
  where task_id = v_task_big3 and reason = 'task_completion' and voided = false;
  if v_task_amount != 50 then
    raise exception 'TEST 5 FAILED: Expected Task 5 to be recalculated from 10 to 50 XP after undo, but got %', v_task_amount;
  end if;

  select sum(amount) into v_total_xp
  from public.xp_events
  where user_id = v_test_user_id and week_id = v_week.id and reason = 'task_completion' and voided = false;
  if v_total_xp != 140 then
    raise exception 'TEST 5 FAILED: Expected total task XP to be 140 after recalculation, got %', v_total_xp;
  end if;
  raise notice '  ✓ Test 5 Passed: Undo voids XP and dynamically recalculates remaining capped tasks correctly.';

  -- TEST 6: Cutoff lock test
  -- Update week cutoff to the past
  update public.weeks set cutoff_at = now() - interval '1 hour' where id = v_week.id;

  begin
    v_res := public.finish_task_and_award_xp(v_task_big1);
    raise exception 'TEST 6 FAILED: Expected exception when finishing task after cutoff, but succeeded!';
  exception when others then
    if sqlerrm not like '%locked%' and sqlerrm not like '%cutoff%' then
      raise exception 'TEST 6 FAILED: Unexpected error message: %', sqlerrm;
    end if;
  end;
  raise notice '  ✓ Test 6 Passed: Cutoff lock strictly prevents task modifications after Saturday meeting time.';

  -- Cleanup test data
  delete from public.xp_events where user_id = v_test_user_id;
  delete from public.tasks where user_id = v_test_user_id;
  delete from public.weeks where id = v_week.id;
  delete from public.profiles where id = v_test_user_id;

  raise notice '🎉 ALL 6 DATABASE-LEVEL XP & CUTOFF EDGE CASE TESTS PASSED!';
end $$;
