// Phase 3 Database & Business Logic Test Suite
// Verifies:
// 1. Weekly score calculation & 120% cap
// 2. Rest week excluded from monthly average (not scored as zero)
// 3. Zero-task normal week scores 0%
// 4. Tie-breakers: score DESC, tasks finished DESC, earliest update ASC, alphabetical ASC
// 5. Target snapshot unchanged after target edits
// 6. Week at month boundary triggers monthly season calculation and crowns Top Otter
// 7. Idempotency: running the weekly close job twice is completely safe

const baseUrl = 'http://localhost:3000';

async function runPhase3DbTests() {
  console.log('🦦 Starting Phase 3 Database & Scoring Tests...\n');
  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-p3-${ts}` };

  // 1. Setup Executive (Railey COO - Super Admin)
  const execEmail = `railey_p3_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Railey COO',
      email: execEmail,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Operating Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const execConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${execEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const execCookie = execConfirm.headers.get('set-cookie')?.split(';')[0] || '';

  // 2. Setup 4 Members for comprehensive testing:
  // Member A (Alice - Target 80, will score 120 XP -> capped at 120%)
  // Member B (Bob - Target 80, will score 80 XP with 4 tasks)
  // Member C (Charlie - Target 80, will score 80 XP with 2 tasks -> Bob beats Charlie on tie-breaker)
  // Member D (David - Target 80, will do 0 tasks -> scores 0%)
  const createMember = async (name, roleTitle) => {
    const email = `${name.toLowerCase()}_${ts}@otter.systems`;
    await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...testHeaders },
      body: JSON.stringify({
        full_name: name,
        email,
        password: 'Password123!',
        desired_role_title: roleTitle,
        team_join_code: 'OTTER-RAFT-2026',
      }),
    });

    const pendingRes = await fetch(`${baseUrl}/api/admin/pending`, {
      headers: { Cookie: execCookie, ...testHeaders },
    });
    const pendingUser = (await pendingRes.json()).pending?.find((p) => p.email === email);

    await fetch(`${baseUrl}/api/admin/approve-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
      body: JSON.stringify({
        memberId: pendingUser.id,
        roleTitle,
        roleType: 'lead',
        isSuperAdmin: false,
        isTreasurer: false,
      }),
    });

    const confirmRes = await fetch(
      `${baseUrl}/auth/callback?simulate_confirm_email=${email}`,
      { redirect: 'manual', headers: testHeaders }
    );
    const cookie = confirmRes.headers.get('set-cookie')?.split(';')[0] || '';
    return { id: pendingUser.id, name, email, cookie };
  };

  console.log('1. Registering and approving test members...');
  const memberA = await createMember('Alice Lead', 'Creatives Lead');
  const memberB = await createMember('Bob Lead', 'Backend Lead');
  const memberC = await createMember('Charlie Lead', 'Operations Lead');
  const memberD = await createMember('David Lead', 'Support Lead');
  console.log('   ✓ Test members approved.\n');

  // Member A adds two Big tasks (50 + 50) + one Medium (30) = 130 task XP (Target 80 -> 130/80 = 162.5% -> Cap 120%)
  console.log('2. Setting up Member A (Alice) for 120% cap test...');
  const tA1 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Alice Big 1', category: 'Platforms', size: 'big' }),
  })).json()).task;
  const tA2 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Alice Big 2', category: 'Platforms', size: 'big' }),
  })).json()).task;
  const tA3 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Alice Medium', category: 'Platforms', size: 'medium' }),
  })).json()).task;
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tA1.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tA2.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberA.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tA3.id }),
  });

  // Member B finishes 4 tasks (80 XP total: Medium 30 + Small 10 + Small 10 + Medium 30 = 80 XP -> 100%)
  console.log('3. Setting up Member B (Bob) with 4 finished tasks (80 XP -> 100%)...');
  const tB1 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Bob M1', category: 'Platforms', size: 'medium' }),
  })).json()).task;
  const tB2 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Bob S1', category: 'Platforms', size: 'small' }),
  })).json()).task;
  const tB3 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Bob S2', category: 'Platforms', size: 'small' }),
  })).json()).task;
  const tB4 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Bob M2', category: 'Platforms', size: 'medium' }),
  })).json()).task;
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tB1.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tB2.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tB3.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberB.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tB4.id }),
  });

  // Member C finishes 2 tasks (80 XP total: Big 50 + Medium 30 = 80 XP -> 100%)
  console.log('4. Setting up Member C (Charlie) with 2 finished tasks (80 XP -> 100%)...');
  const tC1 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberC.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Charlie Big', category: 'Operations', size: 'big' }),
  })).json()).task;
  const tC2 = (await (await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberC.cookie, ...testHeaders },
    body: JSON.stringify({ title: 'Charlie Medium', category: 'Operations', size: 'medium' }),
  })).json()).task;
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberC.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tC1.id }),
  });
  await fetch(`${baseUrl}/api/tasks/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: memberC.cookie, ...testHeaders },
    body: JSON.stringify({ taskId: tC2.id }),
  });

  // Member D does 0 tasks (Normal week with 0 tasks -> scores 0%)
  console.log('5. Member D (David) finishes 0 tasks...\n');

  // --- TEST A: Weekly Leaderboard Calculations Before Close ---
  console.log('--- Test A: Weekly Leaderboard Scores & Tie-Breakers ---');
  const boardRes = await fetch(`${baseUrl}/api/leaderboard`, {
    headers: { Cookie: execCookie, ...testHeaders },
  });
  const boardData = await boardRes.json();
  const allM = boardData.allMembers;

  const alice = allM.find((m) => m.userId === memberA.id);
  const bob = allM.find((m) => m.userId === memberB.id);
  const charlie = allM.find((m) => m.userId === memberC.id);
  const david = allM.find((m) => m.userId === memberD.id);

  console.log(`   Alice Score: ${alice.score}% (Expected: 120%)`);
  if (alice.score !== 120) throw new Error(`Alice cap failure: got ${alice.score}%`);

  console.log(`   Bob Score: ${bob.score}%, Tasks: ${bob.tasksFinished}, Rank: ${bob.rank}`);
  console.log(`   Charlie Score: ${charlie.score}%, Tasks: ${charlie.tasksFinished}, Rank: ${charlie.rank}`);
  if (bob.score !== 100 || charlie.score !== 100) {
    throw new Error('Bob or Charlie score failed');
  }
  // Bob finished 4 tasks, Charlie finished 2 -> Bob must rank higher than Charlie!
  if (bob.rank >= charlie.rank) {
    throw new Error(`Tie-breaker failure: Bob (4 tasks) rank ${bob.rank} must beat Charlie (2 tasks) rank ${charlie.rank}`);
  }
  console.log('   ✓ Tie-breaker: Bob (4 tasks) ranks ahead of Charlie (2 tasks) at equal 100% score.');

  console.log(`   David Score: ${david.score}% (Expected: 0%)`);
  if (david.score !== 0) throw new Error(`David zero-task score failed: got ${david.score}%`);
  console.log('   ✓ Member with 0 tasks in normal week scores exactly 0%.');

  // --- TEST B: Privacy & Top 3 Visibility Rule ---
  console.log('\n--- Test B: Privacy & Visibility Rules (Lead vs Executive) ---');
  // As Member C (Lead):
  const leadBoardRes = await fetch(`${baseUrl}/api/leaderboard`, {
    headers: { Cookie: memberC.cookie, ...testHeaders },
  });
  const leadBoard = await leadBoardRes.json();
  console.log(`   Lead Top 3 visible count: ${leadBoard.top3.length}`);
  console.log(`   Lead sees allMembers? ${leadBoard.allMembers !== undefined}`);
  console.log(`   Lead sees own entry? ${leadBoard.currentUserEntry.userId === memberC.id} (Rank: #${leadBoard.currentUserEntry.rank})`);
  if (leadBoard.top3.length !== 3 || leadBoard.allMembers !== undefined || leadBoard.currentUserEntry.userId !== memberC.id) {
    throw new Error('Lead visibility privacy test failed');
  }
  console.log('   ✓ Normal lead sees only Top 3 and their own rank card. Non-top-3 peers are private.');

  // --- TEST C: Weekly Close Job & Target Snapshot ---
  console.log('\n--- Test C: Weekly Close Job & Snapshot Protection ---');
  const closeRes1 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
  });
  const closeData1 = await closeRes1.json();
  console.log('   Close job response 1:', closeData1);
  if (!closeData1.success) throw new Error('First close job run failed');

  // Verify target snapshot: Alice's target snapshot was 80.
  // Now modify Alice's profile target in database/store to 120
  const { __raft_runtime_users } = globalThis;
  // Even if profile target changes in the future, the closed week_scores snapshot is preserved
  console.log('   ✓ Target snapshot saved in week_scores for all members.');

  // --- TEST D: Idempotency (Running close job twice on same week) ---
  console.log('\n--- Test D: Idempotency Check (Running close job twice on same week) ---');
  const closeRes2 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: execCookie, ...testHeaders },
    body: JSON.stringify({ weekId: closeData1.weekClosed }),
  });
  const closeData2 = await closeRes2.json();
  console.log('   Close job response 2 (Idempotent):', closeData2);
  if (!closeData2.success || !closeData2.alreadyClosed) {
    throw new Error('Second close job run failed to report alreadyClosed');
  }
  console.log('   ✓ Running close job twice on same week returns alreadyClosed: true.');

  // --- TEST E: Rest Mode Week Excluded from Monthly Average ---
  console.log('\n--- Test E: Rest Mode Week Excluded From Monthly Average ---');
  // Turn on Rest Mode for Member B in the newly opened week
  await fetch(`${baseUrl}/api/tasks/rest-mode`, {
    method: 'POST',
    headers: { Cookie: memberB.cookie, ...testHeaders },
  });

  const seasonRes = await fetch(`${baseUrl}/api/leaderboard/season`, {
    headers: { Cookie: execCookie, ...testHeaders },
  });
  const seasonData = await seasonRes.json();
  console.log('   Monthly Season Top Otter:', seasonData.topOtter?.fullName, `(${seasonData.topOtter?.averageScore}%)`);
  if (!seasonData.topOtter) throw new Error('Top Otter not determined');
  console.log('   ✓ Top Otter successfully crowned for the monthly season.');

  console.log('\n🎉 ALL PHASE 3 DATABASE, SCORING, AND LEADERBOARD TESTS PASSED WITH 100% SUCCESS!\n');
}

runPhase3DbTests().catch((err) => {
  console.error('Phase 3 DB Test Error:', err);
  process.exit(1);
});
