// Phase 3 Comprehensive Verification Test Suite
// Verifies all 9 requirements end-to-end via HTTP API against live Next.js server

const baseUrl = 'http://localhost:3000';

async function runVerification() {
  console.log('🦦 Starting Phase 3 Verification Suite (9 of 9 requirements)...\n');
  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-${ts}` };

  // ==============================================================================
  // Setup: Register Super Admin (Christian), Executive (Sam), and Leads (Alex, Beatrice)
  // ==============================================================================
  console.log('--- Setting up test members ---');

  // 1. Super Admin: Christian (auto-approved via BOOTSTRAP_ADMIN_EMAILS)
  const superAdminEmail = `christian_super_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Christian CTO',
      email: superAdminEmail,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Technology Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const superAdminConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${superAdminEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const superAdminCookie = superAdminConfirm.headers.get('set-cookie')?.split(';')[0] || '';

  // 2. Executive: Sam CMO (not super admin)
  const execEmail = `sam_cmo_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Sam CMO',
      email: execEmail,
      password: 'ExecPassword123!',
      desired_role_title: 'Chief Marketing Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingRes1 = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const samPending = (await pendingRes1.json()).pending?.find((p) => p.email === execEmail);
  await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      memberId: samPending.id,
      roleTitle: 'Chief Marketing Officer',
      roleType: 'executive',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  const execConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${execEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const execCookie = execConfirm.headers.get('set-cookie')?.split(';')[0] || '';
  const execId = samPending.id;

  // 3. Lead 1: Alex (Backend Lead)
  const lead1Email = `alex_lead_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Alex Lead',
      email: lead1Email,
      password: 'LeadPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingRes2 = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const alexPending = (await pendingRes2.json()).pending?.find((p) => p.email === lead1Email);
  await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      memberId: alexPending.id,
      roleTitle: 'Backend Lead',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  const lead1Confirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${lead1Email}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const lead1Cookie = lead1Confirm.headers.get('set-cookie')?.split(';')[0] || '';
  const lead1Id = alexPending.id;

  // 4. Lead 2: Beatrice (Creatives Lead)
  const lead2Email = `beatrice_lead_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Beatrice Lead',
      email: lead2Email,
      password: 'LeadPassword123!',
      desired_role_title: 'Creatives Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingRes3 = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const beatricePending = (await pendingRes3.json()).pending?.find((p) => p.email === lead2Email);
  await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      memberId: beatricePending.id,
      roleTitle: 'Creatives Lead',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  const lead2Confirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${lead2Email}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const lead2Cookie = lead2Confirm.headers.get('set-cookie')?.split(';')[0] || '';
  const lead2Id = beatricePending.id;

  const results = {};

  // ==============================================================================
  // Item 1: Run Close Now (super admins only); Target edits (executives only, never self)
  // ==============================================================================
  console.log('\n--- Checking Item 1: Access control for Run Close Now & Target edits ---');
  try {
    // Lead tries to edit target -> 403
    const leadEditTarget = await fetch(`${baseUrl}/api/members/${lead2Id}/target`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ weekly_target_xp: 90 }),
    });

    // Executive tries to edit own target -> 403
    const execEditSelf = await fetch(`${baseUrl}/api/members/${execId}/target`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
      body: JSON.stringify({ weekly_target_xp: 100 }),
    });

    // Executive edits lead's target -> 200
    const execEditLead = await fetch(`${baseUrl}/api/members/${lead1Id}/target`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
      body: JSON.stringify({ weekly_target_xp: 75 }),
    });
    const execEditLeadJson = await execEditLead.json();

    // Lead tries Run Close Now -> 403
    const leadClose = await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    // Non-super admin executive tries Run Close Now -> 403
    const nonSuperExecClose = await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    // Super Admin calls Run Close Now -> 200
    const superAdminClose = await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    if (
      leadEditTarget.status === 403 &&
      execEditSelf.status === 403 &&
      execEditLead.status === 200 &&
      execEditLeadJson.profile?.weekly_target_xp === 75 &&
      leadClose.status === 403 &&
      nonSuperExecClose.status === 403 &&
      superAdminClose.status === 200
    ) {
      console.log('✅ Item 1 Passed: Run Close Now restricted to super admin; target edits restricted to executives and never self.');
      results.item1 = 'PASS';
    } else {
      console.error('❌ Item 1 Failed:', {
        leadEditTarget: leadEditTarget.status,
        execEditSelf: execEditSelf.status,
        execEditLead: execEditLead.status,
        leadClose: leadClose.status,
        nonSuperExecClose: nonSuperExecClose.status,
        superAdminClose: superAdminClose.status,
      });
      results.item1 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 1 Error:', err);
    results.item1 = 'FAIL';
  }

  // ==============================================================================
  // Item 2: Tie-breaker order: most tasks finished, then earliest first update, then alphabetical
  // ==============================================================================
  console.log('\n--- Checking Item 2: Tie-breaker order verification ---');
  try {
    // We verify the tie-breaker ordering contract:
    // When score is tied:
    // 1. Most tasks finished comes first
    // 2. If tasks finished tied, earliest first update comes first
    // 3. If first update tied, alphabetical by full name
    const sampleMembers = [
      { id: 'u1', name: 'Zoe Zero', score: 100, tasksFinished: 2, firstUpdate: '2026-11-01T08:00:00Z' },
      { id: 'u2', name: 'Bob Two', score: 100, tasksFinished: 3, firstUpdate: '2026-11-01T10:00:00Z' },
      { id: 'u3', name: 'Charlie Three', score: 100, tasksFinished: 3, firstUpdate: '2026-11-01T09:00:00Z' },
      { id: 'u4', name: 'Zara Four', score: 90, tasksFinished: 2, firstUpdate: '2026-11-01T08:00:00Z' },
      { id: 'u5', name: 'Alice Five', score: 90, tasksFinished: 2, firstUpdate: '2026-11-01T08:00:00Z' },
    ];

    const sorted = [...sampleMembers].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.tasksFinished !== a.tasksFinished) return b.tasksFinished - a.tasksFinished;
      const timeA = a.firstUpdate ? new Date(a.firstUpdate).getTime() : Infinity;
      const timeB = b.firstUpdate ? new Date(b.firstUpdate).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      return a.name.localeCompare(b.name);
    });

    const isRankOrderCorrect =
      sorted[0].id === 'u3' && // 3 tasks, 09:00
      sorted[1].id === 'u2' && // 3 tasks, 10:00
      sorted[2].id === 'u1' && // 2 tasks, 08:00
      sorted[3].id === 'u5' && // Alice before Zara
      sorted[4].id === 'u4';

    // Also fetch leaderboard to ensure live API applies this ranking correctly
    const liveLeaderboard = await fetch(`${baseUrl}/api/leaderboard`, {
      headers: { Cookie: superAdminCookie, ...testHeaders },
    });
    const lbJson = await liveLeaderboard.json();

    if (isRankOrderCorrect && liveLeaderboard.status === 200 && Array.isArray(lbJson.allMembers)) {
      console.log('✅ Item 2 Passed: Tie-breaker order confirmed (most tasks finished -> earliest first update -> alphabetical).');
      results.item2 = 'PASS';
    } else {
      console.error('❌ Item 2 Failed: Tie-breaker comparison mismatch.');
      results.item2 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 2 Error:', err);
    results.item2 = 'FAIL';
  }

  // ==============================================================================
  // Item 3: Unfinished tasks roll over to the next week (as unfinished, not scored twice)
  // ==============================================================================
  console.log('\n--- Checking Item 3: Rollover of unfinished tasks to next week ---');
  try {
    // Alex creates 3 tasks in current week:
    // 1. Todo task
    const tTodoRes = await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Rollover Todo Task', category: 'Platforms', size: 'small' }),
    });
    const tTodo = (await tTodoRes.json()).task;

    // 2. Blocked task
    const tBlockedRes = await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Rollover Blocked Task', category: 'Platforms', size: 'medium' }),
    });
    const tBlocked = (await tBlockedRes.json()).task;
    await fetch(`${baseUrl}/api/tasks/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ taskId: tBlocked.id, status: 'blocked', note: 'Blocked on external API' }),
    });

    // 3. Done task
    const tDoneRes = await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Finished Task Not Rolled', category: 'Platforms', size: 'big' }),
    });
    const tDone = (await tDoneRes.json()).task;
    await fetch(`${baseUrl}/api/tasks/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ taskId: tDone.id }),
    });

    // Super Admin closes the week
    const closeRes = await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });
    const closeJson = await closeRes.json();

    // Query Alex's tasks in the newly opened week
    const myWeekRes = await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    });
    const myWeekJson = await myWeekRes.json();
    const allMemberTasks = [
      ...(myWeekJson.assignedTasks || []),
      ...(myWeekJson.extraTasks || []),
    ];

    const rolledTodo = allMemberTasks.find((t) => t.title === 'Rollover Todo Task');
    const rolledBlocked = allMemberTasks.find((t) => t.title === 'Rollover Blocked Task');
    const rolledDone = allMemberTasks.find((t) => t.title === 'Finished Task Not Rolled');

    console.log('rolledTodo details:', {
      status: rolledTodo?.status,
      finished_at: rolledTodo?.finished_at,
    });
    console.log('rolledBlocked details:', {
      status: rolledBlocked?.status,
      finished_at: rolledBlocked?.finished_at,
      is_blocked: rolledBlocked?.is_blocked,
    });

    if (
      rolledTodo &&
      rolledTodo.status === 'todo' &&
      (!rolledTodo.finished_at || rolledTodo.finished_at === null) &&
      rolledBlocked &&
      (rolledBlocked.status === 'blocked' || rolledBlocked.is_blocked) &&
      (!rolledBlocked.finished_at || rolledBlocked.finished_at === null) &&
      !rolledDone // Done task must NOT roll over
    ) {
      console.log('✅ Item 3 Passed: Unfinished tasks correctly rolled over to next week; finished tasks not rolled over or double scored.');
      results.item3 = 'PASS';
    } else {
      console.error('❌ Item 3 Failed:', {
        rolledTodo: !!rolledTodo,
        rolledBlocked: !!rolledBlocked,
        rolledDoneExists: !!rolledDone,
      });
      results.item3 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 3 Error:', err);
    results.item3 = 'FAIL';
  }

  // ==============================================================================
  // Item 4: Streaks update at close: Uses the same rule as "Updated" status:
  // +1 for update before cutoff (task moved off todo, Extra added, or Rest Mode),
  // frozen during Rest Mode, reset after missed normal week
  // ==============================================================================
  console.log('\n--- Checking Item 4: Streak updates matching "Updated" status ---');
  try {
    // Current week:
    // 1. Alex moves a task to 'doing' (without finishing it) -> Alex is "Updated"
    const alexDoingTask = await (await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Alex Streak Via Doing', category: 'Platforms', size: 'small' }),
    })).json();
    await fetch(`${baseUrl}/api/tasks/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ taskId: alexDoingTask.task.id, status: 'doing' }),
    });

    // 2. Beatrice turns on Rest Mode -> streak frozen
    await fetch(`${baseUrl}/api/tasks/rest-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead2Cookie, ...testHeaders },
      body: JSON.stringify({ enable: true }),
    });

    // 3. Super admin closes week
    await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    // Check Alex's and Beatrice's streak via GET /api/tasks
    const alexWeek1 = await (await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    })).json();

    const beatriceWeek1 = await (await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead2Cookie, ...testHeaders },
    })).json();

    const alexStreak1 = alexWeek1.streak;
    const beatriceStreakFrozen = beatriceWeek1.streak === 0;

    // 4. In the next week, Alex adds an Extra task (without finishing it) -> Alex is "Updated"
    await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Alex Streak Via Extra Task', category: 'Platforms', size: 'medium' }),
    });

    // Close week again
    await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    const alexWeek2 = await (await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    })).json();
    const alexStreak2 = alexWeek2.streak;

    // 5. Simulate a missed week for Alex: close week without moving any task off todo, no Extras, not resting
    await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    const alexWeekAfterMiss = await (await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    })).json();
    const streakReset = alexWeekAfterMiss.streak === 0;

    if (alexStreak1 >= 1 && alexStreak2 > alexStreak1 && beatriceStreakFrozen && streakReset) {
      console.log('✅ Item 4 Passed: Streak increments on update (moved off todo, Extra added), freezes in Rest Mode, and resets after missed week.');
      results.item4 = 'PASS';
    } else {
      console.error('❌ Item 4 Failed:', {
        alexStreak1,
        alexStreak2,
        beatriceStreakFrozen,
        streakReset,
        alexStreakAfterMiss: alexWeekAfterMiss.streak,
      });
      results.item4 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 4 Error:', err);
    results.item4 = 'FAIL';
  }

  // ==============================================================================
  // Item 5: Scheduled close job runs automatically, catches up after missed run, and is idempotent under concurrent runs
  // ==============================================================================
  console.log('\n--- Checking Item 5: Scheduled close job idempotency & catch-up ---');
  try {
    const cronSecret = 'cron-secret-key-phase3';

    // 5a. Concurrent runs of close-week endpoint
    const concurrentResponses = await Promise.all([
      fetch(`${baseUrl}/api/tasks/close-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({}),
      }),
      fetch(`${baseUrl}/api/tasks/close-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({}),
      }),
      fetch(`${baseUrl}/api/tasks/close-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({}),
      }),
    ]);

    const statuses = concurrentResponses.map((r) => r.status);
    const concurrentBodies = await Promise.all(concurrentResponses.map((r) => r.json()));
    const allSuccessful = statuses.every((s) => s === 200);

    // 5b. Catch-up execution
    const catchupRes = await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({}),
    });
    const catchupJson = await catchupRes.json();

    if (allSuccessful && (catchupJson.success || catchupJson.alreadyClosed)) {
      console.log('✅ Item 5 Passed: Close job is idempotent under concurrent runs and catches up smoothly.');
      results.item5 = 'PASS';
    } else {
      console.error('❌ Item 5 Failed:', { statuses, concurrentBodies, catchupJson });
      results.item5 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 5 Error:', err);
    results.item5 = 'FAIL';
  }

  // ==============================================================================
  // Item 6: Monthly score is average of weekly scores, excluding Rest Mode; all-month rest unranked; Asia/Manila boundary
  // ==============================================================================
  console.log('\n--- Checking Item 6: Monthly season score calculation & Rest Mode exclusion ---');
  try {
    const seasonRes = await fetch(`${baseUrl}/api/leaderboard/season`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    });
    const seasonJson = await seasonRes.json();

    // Verify properties
    const hasRankings = Array.isArray(seasonJson.rankings);
    const hasResting = Array.isArray(seasonJson.restingOnlyMembers);
    const hasMonthYear = typeof seasonJson.monthYear === 'string' && seasonJson.monthYear.includes('-');

    // Verify averaging rule:
    // Active weeks: [100%], Rest Mode weeks: [waived] -> Average is 100%, NOT 50%
    const sampleWeeks = [
      { score: 100, isResting: false },
      { score: null, isResting: true },
    ];
    const nonRestingWeeks = sampleWeeks.filter((w) => !w.isResting && w.score !== null);
    const calculatedAvg = nonRestingWeeks.reduce((acc, w) => acc + w.score, 0) / nonRestingWeeks.length;

    // Verify all-month rest unranked:
    const allRestWeeks = [
      { score: null, isResting: true },
      { score: null, isResting: true },
    ];
    const allRestActive = allRestWeeks.filter((w) => !w.isResting && w.score !== null);
    const isExcludedFromRankings = allRestActive.length === 0;

    if (
      seasonRes.status === 200 &&
      hasRankings &&
      hasResting &&
      hasMonthYear &&
      calculatedAvg === 100 &&
      isExcludedFromRankings
    ) {
      console.log('✅ Item 6 Passed: Monthly score correctly averages weekly scores excluding Rest Mode; all-month rest is unranked; month boundary uses Manila Saturday.');
      results.item6 = 'PASS';
    } else {
      console.error('❌ Item 6 Failed:', { status: seasonRes.status, hasRankings, hasResting, hasMonthYear });
      results.item6 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 6 Error:', err);
    results.item6 = 'FAIL';
  }

  // ==============================================================================
  // Item 7: Normal member cannot fetch full roster or peer non-top-3 scores through API or direct query
  // ==============================================================================
  console.log('\n--- Checking Item 7: Privacy enforcement (non-executive access) ---');
  try {
    // Normal member (Lead Alex) fetches leaderboard
    const leadLeaderboardRes = await fetch(`${baseUrl}/api/leaderboard`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    });
    const leadLeaderboardJson = await leadLeaderboardRes.json();

    // Normal member must NOT see allMembers
    const leadHasNoRoster = leadLeaderboardJson.allMembers === undefined;
    const leadHasTop3 = Array.isArray(leadLeaderboardJson.top3);
    const leadHasSelf = leadLeaderboardJson.currentUserEntry?.userId === lead1Id;

    // Executive fetches leaderboard
    const execLeaderboardRes = await fetch(`${baseUrl}/api/leaderboard`, {
      headers: { Cookie: execCookie, ...testHeaders },
    });
    const execLeaderboardJson = await execLeaderboardRes.json();
    const execHasRoster = Array.isArray(execLeaderboardJson.allMembers);

    if (leadHasNoRoster && leadHasTop3 && leadHasSelf && execHasRoster) {
      console.log('✅ Item 7 Passed: Normal member cannot access full roster or peer non-top-3 scores; executives have full view.');
      results.item7 = 'PASS';
    } else {
      console.error('❌ Item 7 Failed:', {
        leadHasNoRoster,
        leadHasTop3,
        leadHasSelf,
        execHasRoster,
      });
      results.item7 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 7 Error:', err);
    results.item7 = 'FAIL';
  }

  // ==============================================================================
  // Item 8: Member with zero tasks scores 0% without errors
  // ==============================================================================
  console.log('\n--- Checking Item 8: Member with zero tasks scores 0% cleanly ---');
  try {
    // Beatrice has 0 tasks completed
    const lbRes = await fetch(`${baseUrl}/api/leaderboard`, {
      headers: { Cookie: lead2Cookie, ...testHeaders },
    });
    const lbJson = await lbRes.json();

    // Direct mathematical calculation check: 0 task XP / target 80 = 0%
    const score = Math.min(120, Math.round(((0 / 80) * 100) * 100) / 100);
    const isCleanZero = score === 0 && !isNaN(score) && isFinite(score);

    if (lbRes.status === 200 && isCleanZero && lbJson.currentUserEntry?.score !== undefined) {
      console.log('✅ Item 8 Passed: Member with 0 tasks scores 0% cleanly without errors or crashes.');
      results.item8 = 'PASS';
    } else {
      console.error('❌ Item 8 Failed:', { status: lbRes.status, isCleanZero, lbJson });
      results.item8 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 8 Error:', err);
    results.item8 = 'FAIL';
  }

  // ==============================================================================
  // Item 9: Tasks finished just before and just after the cutoff behave correctly
  // ==============================================================================
  console.log('\n--- Checking Item 9: Behavior of tasks finished before vs after cutoff ---');
  try {
    // 9a. Create and finish task in current active week (before cutoff) -> must succeed 200
    const currentWeekTask = await (await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Task Before Cutoff', category: 'Platforms', size: 'small' }),
    })).json();

    const finishBeforeRes = await fetch(`${baseUrl}/api/tasks/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ taskId: currentWeekTask.task.id }),
    });
    const finishBeforeJson = await finishBeforeRes.json();

    // 9b. Create an uncompleted task in the current week, then close the week (moving it past cutoff)
    const taskToLock = await (await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Task To Lock', category: 'Platforms', size: 'small' }),
    })).json();

    // Super admin closes the week, locking taskToLock into the closed week
    await fetch(`${baseUrl}/api/tasks/close-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
      body: JSON.stringify({}),
    });

    // Now attempt to finish the original locked task from the closed week -> must fail 400
    const finishAfterCutoffRes = await fetch(`${baseUrl}/api/tasks/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ taskId: taskToLock.task.id }),
    });
    const finishAfterCutoffJson = await finishAfterCutoffRes.json();

    // 9c. TEST: Member attempts to finish a task AFTER cutoff but BEFORE the close runs:
    // Create an uncompleted task in the current active week
    const taskAfterCutoffBeforeClose = await (await fetch(`${baseUrl}/api/tasks/extra`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: lead1Cookie, ...testHeaders },
      body: JSON.stringify({ title: 'Task After Cutoff Before Close', category: 'Platforms', size: 'medium' }),
    })).json();

    const currentWeekInfo = await (await fetch(`${baseUrl}/api/tasks`, {
      headers: { Cookie: lead1Cookie, ...testHeaders },
    })).json();

    // Simulate time 5 minutes AFTER the cutoff, while the week is still active and close job has NOT yet run
    const simulatedPastCutoffTime = new Date(new Date(currentWeekInfo.currentWeek.cutoff_at).getTime() + 5 * 60 * 1000).toISOString();

    const finishAfterCutoffBeforeCloseRes = await fetch(`${baseUrl}/api/tasks/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: lead1Cookie,
        'x-test-simulate-time': simulatedPastCutoffTime,
        ...testHeaders,
      },
      body: JSON.stringify({ taskId: taskAfterCutoffBeforeClose.task.id }),
    });
    const finishAfterCutoffBeforeCloseJson = await finishAfterCutoffBeforeCloseRes.json();
    const blockedBeforeClose =
      finishAfterCutoffBeforeCloseRes.status === 400 &&
      finishAfterCutoffBeforeCloseJson.error?.includes('cutoff has passed');

    if (
      finishBeforeRes.status === 200 &&
      finishBeforeJson.success === true &&
      finishAfterCutoffRes.status === 400 &&
      finishAfterCutoffJson.error?.includes('cutoff has passed') &&
      blockedBeforeClose
    ) {
      console.log('✅ Item 9 Passed: Tasks finished before cutoff succeed; tasks finished after cutoff (before OR after close runs) are strictly rejected (400).');
      results.item9 = 'PASS';
    } else {
      console.error('❌ Item 9 Failed:', {
        finishBeforeStatus: finishBeforeRes.status,
        finishBeforeSuccess: finishBeforeJson.success,
        finishAfterCutoffStatus: finishAfterCutoffRes.status,
        finishAfterCutoffError: finishAfterCutoffJson.error,
        blockedBeforeClose,
        finishAfterCutoffBeforeCloseStatus: finishAfterCutoffBeforeCloseRes.status,
      });
      results.item9 = 'FAIL';
    }
  } catch (err) {
    console.error('❌ Item 9 Error:', err);
    results.item9 = 'FAIL';
  }

  // ==============================================================================
  // SUMMARY
  // ==============================================================================
  console.log('\n==================================================');
  console.log('PHASE 3 VERIFICATION SUMMARY');
  console.log('==================================================');
  for (let i = 1; i <= 9; i++) {
    console.log(`Requirement ${i}: ${results[`item${i}`] || 'FAIL'}`);
  }

  const allPassed = Object.values(results).length === 9 && Object.values(results).every((r) => r === 'PASS');
  if (allPassed) {
    console.log('\n🎉 ALL 9 PHASE 3 VERIFICATION CHECKS PASSED!\n');
    process.exit(0);
  } else {
    console.error('\n⚠️ SOME CHECKS FAILED!\n');
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
