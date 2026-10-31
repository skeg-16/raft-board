// Test Suite for Weekly Close Refinements & Scheduler Requirements (5 checks)
const baseUrl = 'http://localhost:3000';
import fs from 'fs';
import path from 'path';

async function runRefinementsTest() {
  console.log('🦦 Starting Weekly Close Refinements & Scheduler Test Suite...\n');
  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-${ts}` };

  // Setup: Register Super Admin (must start with christian_ to auto-approve on confirmation)
  const superAdminEmail = `christian_refine_${ts}@otter.systems`;
  const superAdminSignup = await fetch(`${baseUrl}/api/auth/signup`, {
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
  if (superAdminSignup.status !== 200) {
    throw new Error(`Super admin signup failed: ${superAdminSignup.status}`);
  }

  const superAdminConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${superAdminEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const superAdminCookie = superAdminConfirm.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('Super Admin Cookie obtained successfully.');

  // Setup: Register Normal Member (Alex Lead)
  const leadEmail = `alex_refine_${ts}@otter.systems`;
  const alexSignupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Alex Lead',
      email: leadEmail,
      password: 'LeadPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  if (alexSignupRes.status !== 200) {
    throw new Error(`Alex signup failed: ${alexSignupRes.status}`);
  }

  const pendingRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const pendingData = await pendingRes.json();
  const alexPending = pendingData.pending?.find((p) => p.email === leadEmail);
  if (!alexPending) {
    throw new Error(`Alex not found in pending list.`);
  }

  const approveRes = await fetch(`${baseUrl}/api/admin/approve-member`, {
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
  if (approveRes.status !== 200) {
    throw new Error(`Alex approval failed: ${approveRes.status}`);
  }

  const leadConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${leadEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const leadCookie = leadConfirm.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('Normal Member (Alex Lead) approved and confirmed.\n');

  // ==============================================================================
  // Check 1: pg_cron every 15 min, fast-exit in close_week(), Vercel daily backup
  // ==============================================================================
  console.log('--- Check 1: 15-minute pg_cron schedule & fast-exit when cutoff not passed ---');
  // 1a. Inspect vercel.json for daily backup
  const vercelJsonPath = path.join(process.cwd(), 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  const vercelCron = vercelConfig.crons?.find((c) => c.path === '/api/tasks/close-week');
  const isVercelDaily = vercelCron?.schedule === '0 2 * * *';

  // 1b. Inspect migration for pg_cron every 15 mins
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261101000007_weekly_close_refinements.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const hasPgCron15Min = migrationSql.includes("'*/15 * * * *'") && migrationSql.includes('select public.close_week();');
  const hasFastExitInSql = migrationSql.includes('No pending weeks require closing at this time.');

  // 1c. Fast-exit verification via API when cutoff has not passed
  const cronSecret = 'cron-secret-key-phase3';
  const fastExitRes = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({}),
  });
  const fastExitJson = await fastExitRes.json();
  const fastExitWorked = fastExitJson.success === true && fastExitJson.message?.includes('No pending weeks require closing');

  const check1Pass = isVercelDaily && hasPgCron15Min && hasFastExitInSql && fastExitWorked;
  console.log(`Check 1 Result: ${check1Pass ? 'PASS' : 'FAIL'} (Vercel daily backup: ${isVercelDaily}, pg_cron 15m: ${hasPgCron15Min}, fast-exit: ${fastExitWorked})\n`);
  if (!check1Pass) throw new Error('Check 1 failed');

  // ==============================================================================
  // Check 2: API route and pg_cron both call the same SQL function
  // ==============================================================================
  console.log('--- Check 2: API route and pg_cron call same canonical SQL function ---');
  const apiRoutePath = path.join(process.cwd(), 'src/app/api/tasks/close-week/route.ts');
  const apiRouteCode = fs.readFileSync(apiRoutePath, 'utf8');
  const tasksLibPath = path.join(process.cwd(), 'src/lib/tasks.ts');
  const tasksLibCode = fs.readFileSync(tasksLibPath, 'utf8');

  const routeCallsCloseWeek = apiRouteCode.includes('closeWeek(');
  const libCallsRpcCloseWeek = tasksLibCode.includes(".rpc('close_week'");
  const pgCronCallsCloseWeek = migrationSql.includes('select public.close_week();');
  const check2Pass = routeCallsCloseWeek && libCallsRpcCloseWeek && pgCronCallsCloseWeek;

  console.log(`Check 2 Result: ${check2Pass ? 'PASS' : 'FAIL'} (API route delegates to rpc('close_week'): ${libCallsRpcCloseWeek}, pg_cron calls public.close_week(): ${pgCronCallsCloseWeek})\n`);
  if (!check2Pass) throw new Error('Check 2 failed');

  // ==============================================================================
  // Check 3: Settings meeting_time change updates next cutoff with no cron change
  // ==============================================================================
  console.log('--- Check 3: Settings meeting_time update dynamically adjusts next cutoff ---');
  // Fetch initial settings & week
  const initialSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const initialData = await initialSettingsRes.json();
  const initialCutoff = new Date(initialData.currentWeek.cutoff_at);

  // Update meeting_time to '02:30 PM' (14:30)
  const updateSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({ meeting_time: '02:30 PM' }),
  });
  const updatedData = await updateSettingsRes.json();
  const newCutoff = new Date(updatedData.currentWeek.cutoff_at);

  // Cutoff hours in UTC should have shifted by 4.5 hours (10:00 -> 14:30)
  const cutoffDiffHours = (newCutoff.getTime() - initialCutoff.getTime()) / (1000 * 60 * 60);
  const cutoffFollowed = cutoffDiffHours === 4.5;

  // Verify cron schedule in vercel.json and migration was NOT changed
  const cronUnchanged = vercelCron?.schedule === '0 2 * * *' && hasPgCron15Min;

  // Restore meeting_time to '10:00 AM'
  await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({ meeting_time: '10:00 AM' }),
  });

  const check3Pass = updateSettingsRes.status === 200 && cutoffFollowed && cronUnchanged;
  console.log(`Check 3 Result: ${check3Pass ? 'PASS' : 'FAIL'} (Cutoff shifted by +4.5h to 14:30: ${cutoffFollowed}, cron schedule unchanged: ${cronUnchanged})\n`);
  if (!check3Pass) throw new Error('Check 3 failed');

  // ==============================================================================
  // Check 4: Job runs 20 min after cutoff, and missed for a full day (closes once)
  // ==============================================================================
  console.log('--- Check 4: Catch-up after 20 minutes and missed full day (closes correctly once) ---');

  // 4a. Fetch current open week
  const settingsRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const currentWeekData = await settingsRes.json();
  const openWeekCutoff = new Date(currentWeekData.currentWeek.cutoff_at);

  // Create an active task in this open week for Alex Lead
  const createTaskRes = await fetch(`${baseUrl}/api/tasks/extra`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: leadCookie, ...testHeaders },
    body: JSON.stringify({
      title: 'Finish API documentation for catch-up test',
      category: 'Documentation',
      size: 'medium',
      note: 'Rollover and catchup verification',
    }),
  });
  const createdTask = await createTaskRes.json();

  // Scenario 4a: Job runs 20 minutes after cutoff
  const simulatedTime20Min = new Date(openWeekCutoff.getTime() + 20 * 60 * 1000).toISOString();
  const close20MinRun1 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({ simulatedNow: simulatedTime20Min }),
  });
  const close20MinJson1 = await close20MinRun1.json();
  const closed20MinOnce = close20MinJson1.success === true && !!close20MinJson1.weekClosed;

  // Next scheduled trigger 15 minutes later (35 min after cutoff) -> must exit immediately
  const simulatedTime35Min = new Date(openWeekCutoff.getTime() + 35 * 60 * 1000).toISOString();
  const close20MinRun2 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({ simulatedNow: simulatedTime35Min }),
  });
  const close20MinJson2 = await close20MinRun2.json();
  const exitedImmediately20Min =
    close20MinJson2.success === true &&
    close20MinJson2.message?.includes('No pending weeks require closing');

  // Scenario 4b: Job was missed for a full day (24 hours after cutoff)
  // Fetch new open week
  const nextSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const nextWeekData = await nextSettingsRes.json();
  const nextWeekCutoff = new Date(nextWeekData.currentWeek.cutoff_at);

  // Trigger missed run: 24 hours after new week's cutoff
  const simulatedTimeFullDay = new Date(nextWeekCutoff.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const closeFullDayRun1 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({ simulatedNow: simulatedTimeFullDay }),
  });
  const closeFullDayJson1 = await closeFullDayRun1.json();
  const closedFullDayOnce = closeFullDayJson1.success === true && !!closeFullDayJson1.weekClosed;

  // Second trigger right after -> must exit immediately
  const closeFullDayRun2 = await fetch(`${baseUrl}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({ simulatedNow: simulatedTimeFullDay }),
  });
  const closeFullDayJson2 = await closeFullDayRun2.json();
  const exitedImmediatelyFullDay =
    closeFullDayJson2.success === true &&
    closeFullDayJson2.message?.includes('No pending weeks require closing');

  const check4Pass =
    closed20MinOnce &&
    exitedImmediately20Min &&
    closedFullDayOnce &&
    exitedImmediatelyFullDay;

  console.log(
    `Check 4 Result: ${check4Pass ? 'PASS' : 'FAIL'} (20-min catchup closed: ${closed20MinOnce}, exited next: ${exitedImmediately20Min}, 1-day catchup closed: ${closedFullDayOnce}, exited next: ${exitedImmediatelyFullDay})\n`
  );
  if (!check4Pass) throw new Error('Check 4 failed');

  // ==============================================================================
  // Check 5: Clear "Week is locked" message in UI with cutoff time
  // ==============================================================================
  console.log('--- Check 5: "Week is locked" message in UI with cutoff time ---');
  const myWeekSource = fs.readFileSync(path.join(process.cwd(), 'src/app/my-week/page.tsx'), 'utf8');
  const hasWeekLockedTitle = myWeekSource.includes('Week is locked');
  const hasCutoffTimeDisplay =
    myWeekSource.includes('{settings?.meeting_weekday}') &&
    myWeekSource.includes('{settings?.meeting_time}') &&
    myWeekSource.includes('{settings?.timezone}');
  const hasCutoffPassedBanner = myWeekSource.includes('isCutoffPassed &&') && myWeekSource.includes('Cutoff Passed');

  const check5Pass = hasWeekLockedTitle && hasCutoffTimeDisplay && hasCutoffPassedBanner;
  console.log(
    `Check 5 Result: ${check5Pass ? 'PASS' : 'FAIL'} ("Week is locked" title: ${hasWeekLockedTitle}, displays meeting day & time: ${hasCutoffTimeDisplay}, alert banner: ${hasCutoffPassedBanner})\n`
  );
  if (!check5Pass) throw new Error('Check 5 failed');

  console.log('==================================================');
  console.log('🎉 ALL 5 REFINEMENT CHECKS PASSED WITH 100% SUCCESS!');
  console.log('==================================================\n');
}

runRefinementsTest().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
