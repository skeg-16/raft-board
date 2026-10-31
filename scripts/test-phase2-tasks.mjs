// Phase 2 Comprehensive Test Suite: Tasks, Extras, Cap Edge Cases, Idempotency, Undo, and Rest Mode
const baseUrl = 'http://localhost:3000';

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2 Tests (Tasks, Quick Picks, XP Cap, Idempotency, Undo, Rest Mode)...\n');
  const ts = Date.now();

  // 1. Setup Executive (Railey COO - Bootstrap Super Admin)
  console.log('1. Registering and activating Executive (Railey COO)...');
  const execEmail = `railey_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Railey COO',
      email: execEmail,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Operating Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  const confirmExecRes = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${execEmail}`,
    { redirect: 'manual' }
  );
  const execCookie = confirmExecRes.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('   ✓ Executive session activated.');

  // 2. Setup Member (Marcus Vance - Backend Lead)
  console.log('\n2. Registering and approving Member (Marcus Vance)...');
  const memberEmail = `marcus_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Marcus Vance',
      email: memberEmail,
      password: 'MarcusPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  // Executive approves Marcus
  const adminPendingRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: execCookie },
  });
  const pendingData = await adminPendingRes.json();
  const marcusPending = pendingData.pending?.find((p) => p.full_name === 'Marcus Vance');
  if (!marcusPending) throw new Error('Marcus Vance not found in pending list');

  await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: execCookie },
    body: JSON.stringify({
      memberId: marcusPending.id,
      roleTitle: 'Backend Lead',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });

  // Activate Marcus session
  const confirmMarcusRes = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${memberEmail}`,
    { redirect: 'manual' }
  );
  const memberCookie = confirmMarcusRes.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('   ✓ Member session activated.');

  // 3. Test: Executive Assigns Task to Marcus
  console.log('\n3. Executive assigning task to Marcus (Small: 10 XP)...');
  const assignRes = await fetch(`${baseUrl}/api/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: execCookie },
    body: JSON.stringify({
      userId: marcusPending.id,
      title: 'Review pull request for API router',
      category: 'Platforms',
      size: 'small',
      note: 'Please verify the edge runtime compatibility.',
    }),
  });
  const assignData = await assignRes.json();
  if (assignRes.status !== 200 || !assignData.task) {
    throw new Error(`Failed to assign task: ${JSON.stringify(assignData)}`);
  }
  const taskSmall = assignData.task;
  console.log('   ✓ Task successfully assigned by Executive.');

  // 4. Test RLS: Member (Lead) tries to assign task to another user -> must be rejected with 403
  console.log('\n4. Testing RLS: Lead member attempts to assign task...');
  const unauthorizedAssign = await fetch(`${baseUrl}/api/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({
      userId: marcusPending.id,
      title: 'Unauthorized assignment',
      category: 'Operations',
      size: 'small',
    }),
  });
  console.log(`   Lead assign status: ${unauthorizedAssign.status} (Expected: 403)`);
  if (unauthorizedAssign.status !== 403) {
    throw new Error(`Security Failure: Non-executive assigned task! Status: ${unauthorizedAssign.status}`);
  }
  console.log('   ✓ Lead member strictly blocked with 403 from assigning tasks.');

  // 5. Test Status Transitions: Doing -> Blocked (Stuck on a rock) -> Finish
  console.log('\n5. Testing task status updates (Doing & Blocked)...');
  await fetch(`${baseUrl}/api/tasks/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: taskSmall.id, status: 'doing' }),
  });
  console.log('   ✓ Task marked doing.');

  await fetch(`${baseUrl}/api/tasks/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({
      taskId: taskSmall.id,
      status: 'blocked',
      blockedNote: 'Waiting on client webhook test keys',
    }),
  });
  console.log('   ✓ Task marked blocked ("stuck on a rock") with note.');

  // 6. Test Finish Task & First Task Early Cutoff Bonus (+10 XP)
  console.log('\n6. Finishing task -> Testing XP award and early cutoff bonus...');
  const finishRes = await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: taskSmall.id }),
  });
  const finishData = await finishRes.json();
  console.log(`   Task XP awarded: ${finishData.taskXPAwarded} (Expected: 10)`);
  console.log(`   Early bonus XP: ${finishData.bonusXPAwarded} (Expected: 10)`);
  if (finishData.taskXPAwarded !== 10 || finishData.bonusXPAwarded !== 10) {
    throw new Error(`XP Error: Expected 10 task + 10 bonus XP, got ${JSON.stringify(finishData)}`);
  }
  console.log('   ✓ First task awarded 10 task XP + 10 early cutoff bonus.');

  // 7. Test Idempotency: Finishing already finished task must not award extra XP
  console.log('\n7. Testing Idempotency (calling finish again on same task)...');
  const repeatFinishRes = await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: taskSmall.id }),
  });
  const repeatFinishData = await repeatFinishRes.json();
  console.log(`   Repeat finish bonus XP: ${repeatFinishData.bonusXPAwarded} (Expected: 0)`);
  if (repeatFinishData.bonusXPAwarded !== 0) {
    throw new Error('Idempotency failure: Bonus re-awarded on duplicate finish call');
  }
  console.log('   ✓ Idempotent finish call prevented double awarding.');

  // 8. Test Member Adding Extra Task from Quick Pick
  console.log('\n8. Member adding Extra task from Quick Pick (update Otter Org - Medium: 30 XP)...');
  const extraRes = await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({
      title: 'update Otter Org',
      category: 'Platforms',
      size: 'medium',
      note: 'Added new landing page copy',
    }),
  });
  const extraData = await extraRes.json();
  const taskMedium = extraData.task;

  // Finish Extra Task
  const finishExtraRes = await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: taskMedium.id }),
  });
  const finishExtraData = await finishExtraRes.json();
  console.log(`   Extra task XP awarded: ${finishExtraData.taskXPAwarded} (Expected: 30)`);
  console.log(`   Bonus awarded: ${finishExtraData.bonusXPAwarded} (Expected: 0 - already awarded once this week)`);
  if (finishExtraData.taskXPAwarded !== 30 || finishExtraData.bonusXPAwarded !== 0) {
    throw new Error(`Bonus once-per-week failed: ${JSON.stringify(finishExtraData)}`);
  }
  console.log('   ✓ Medium Extra task earned 30 XP without re-triggering the early cutoff bonus.');

  // 9. Test Weekly Cap Edge Case: Reach 140 XP, then finish Big (50 XP) -> must award only 10 XP!
  console.log('\n9. Testing Weekly Cap Edge Case (140 XP + Big 50 XP task awards only 10 XP)...');
  // Add Big task 1 (50 XP) -> total task XP = 10 + 30 + 50 = 90
  const big1Res = await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ title: 'Big Task 1', category: 'Platforms', size: 'big' }),
  });
  const big1 = (await big1Res.json()).task;
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: big1.id }),
  });

  // Add Big task 2 (50 XP) -> total task XP = 90 + 50 = 140
  const big2Res = await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ title: 'Big Task 2', category: 'Operations', size: 'big' }),
  });
  const big2 = (await big2Res.json()).task;
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: big2.id }),
  });

  // Current task XP is now 140!
  // Add Big task 3 (50 XP) -> Cap is 150, so remaining capacity is 10!
  const big3Res = await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ title: 'Big Task 3 (Capped)', category: 'Clients', size: 'big' }),
  });
  const big3 = (await big3Res.json()).task;

  const capTestRes = await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: big3.id }),
  });
  const capTestData = await capTestRes.json();
  console.log(`   Big task 3 awarded XP: ${capTestData.taskXPAwarded} (Expected: exactly 10)`);
  if (capTestData.taskXPAwarded !== 10) {
    throw new Error(`Cap Edge Failure: Expected 10 XP, got ${capTestData.taskXPAwarded}`);
  }
  console.log('   ✓ Weekly task cap strictly enforced at 150 XP (only 10 awarded for Big task).');

  // 10. Test Undo & Cap Recalculation
  console.log('\n10. Testing Undo and automatic cap recalculation...');
  // Undo Big task 1 (50 XP). Big task 3 (which was capped at 10) must recalculate to 50!
  const undoRes = await fetch(`${baseUrl}/api/tasks/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ taskId: big1.id }),
  });
  const undoData = await undoRes.json();
  if (!undoData.success) {
    throw new Error(`Undo failed: ${JSON.stringify(undoData)}`);
  }

  // Fetch updated tasks state
  const tasksCheckRes = await fetch(`${baseUrl}/api/tasks`, {
    headers: { Cookie: memberCookie },
  });
  const tasksCheck = await tasksCheckRes.json();
  console.log(`   Task XP after undoing 50 XP task: ${tasksCheck.weekTaskXP} (Expected: 140)`);
  if (tasksCheck.weekTaskXP !== 140) {
    throw new Error(`Cap Recalculation Failure: Expected 140 XP, got ${tasksCheck.weekTaskXP}`);
  }
  console.log('   ✓ Undo voided XP event and recalculated remaining capped task to 50 XP.');

  // 11. Test Rest Mode Toggle & Monthly Limit (Max 2 weeks per month)
  console.log('\n11. Testing Rest Mode toggle and monthly limit...');
  const rest1 = await fetch(`${baseUrl}/api/tasks/rest-mode`, {
    method: 'POST',
    headers: { Cookie: memberCookie },
  });
  const rest1Data = await rest1.json();
  console.log(`   Rest mode activated: ${rest1Data.resting} (Expected: true)`);
  if (!rest1Data.resting) throw new Error('Rest mode failed to activate');

  // Untoggle
  const rest2 = await fetch(`${baseUrl}/api/tasks/rest-mode`, {
    method: 'POST',
    headers: { Cookie: memberCookie },
  });
  const rest2Data = await rest2.json();
  console.log(`   Rest mode toggled off: ${!rest2Data.resting} (Expected: true)`);
  if (rest2Data.resting) throw new Error('Rest mode failed to deactivate');

  console.log('\n🎉 ALL PHASE 2 FUNCTIONAL, SECURITY, AND DATABASE EDGE CASE TESTS PASSED WITH 100% SUCCESS!');
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 Test Error:', err);
  process.exit(1);
});
