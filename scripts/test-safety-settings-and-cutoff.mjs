// Test Suite for Safety Fixes:
// 1. Settings changes apply to NEXT week by default (current open week untouched, past cutoff rejected)
// 2. Separate Super Admin action for current week cutoff (confirmation required, audit log, past cutoff rejected, non-admin blocked)
// 3. /api/tasks/assign calls canonical closeWeek / public.close_week() when cutoff has passed (zero separate close logic)
const baseUrl = 'http://localhost:3000';
import fs from 'fs';
import path from 'path';

async function runSafetyTestSuite() {
  console.log('🦦 Starting Safety Fixes & Cutoff Verification Test Suite...\n');
  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-${ts}` };

  // Setup: Register Super Admin (Christian CTO)
  const superAdminEmail = `christian_safe_${ts}@otter.systems`;
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

  // Setup: Register Normal Member (Alex Lead)
  const leadEmail = `alex_safe_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
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
  const pendingRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const pendingData = await pendingRes.json();
  const alexPending = pendingData.pending?.find((p) => p.email === leadEmail);

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
  const leadConfirm = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${leadEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const leadCookie = leadConfirm.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('Super Admin & Alex Lead registered and authenticated.\n');

  // ==============================================================================
  // Check 1: Settings changes apply to NEXT week by default; current week untouched; past rejected
  // ==============================================================================
  console.log('--- Check 1: Settings apply to NEXT week by default; current open week untouched ---');
  // 1a. Fetch initial settings & current week
  const initialSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const initialData = await initialSettingsRes.json();
  const initialCutoff = initialData.currentWeek.cutoff_at;
  const initialWeekId = initialData.currentWeek.id;

  // 1b. Update settings to a new weekday and time (e.g. Wednesday 3:00 PM)
  const patchSettingsRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Wednesday',
      meeting_time: '03:00 PM',
    }),
  });
  const patchData = await patchSettingsRes.json();
  const currentWeekAfterSettings = patchData.currentWeek;

  // Verify that the current open week's cutoff was NOT altered or closed!
  const currentCutoffUntouched = currentWeekAfterSettings.cutoff_at === initialCutoff;
  const currentWeekStillOpen = currentWeekAfterSettings.is_current === true && currentWeekAfterSettings.id === initialWeekId;
  const settingsUpdatedForNextWeek = patchData.settings.meeting_weekday === 'Wednesday' && patchData.settings.meeting_time === '03:00 PM';

  console.log(`1a. Settings updated: weekday=${patchData.settings.meeting_weekday}, time=${patchData.settings.meeting_time}`);
  console.log(`    Current open week cutoff untouched: ${currentCutoffUntouched} (${initialCutoff})`);
  console.log(`    Current week still open: ${currentWeekStillOpen}`);

  // 1c. Rejection of cutoff in the past
  const pastCutoffRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    }),
  });
  const pastCutoffJson = await pastCutoffRes.json();
  const pastCutoffRejected = pastCutoffRes.status === 400 && pastCutoffJson.error?.includes('past');
  console.log(`1b. Past cutoff rejected by settings endpoint: status=${pastCutoffRes.status}, error="${pastCutoffJson.error}"`);

  // Restore settings to Saturday 10:00 AM
  await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Saturday',
      meeting_time: '10:00 AM',
    }),
  });

  const check1Pass = currentCutoffUntouched && currentWeekStillOpen && settingsUpdatedForNextWeek && pastCutoffRejected;
  console.log(`Check 1 Result: ${check1Pass ? 'PASS' : 'FAIL'}\n`);
  if (!check1Pass) throw new Error('Check 1 failed');

  // ==============================================================================
  // Check 2: Separate Super Admin action with confirmation and audit log
  // ==============================================================================
  console.log('--- Check 2: Separate Super Admin action for current week cutoff & audit logging ---');

  // 2a. Non-super admin (Lead) attempts to change current week cutoff -> 403 Forbidden
  const leadOverrideRes = await fetch(`${baseUrl}/api/settings/current-week-cutoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: leadCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      confirmed: true,
      reason: 'Lead attempting unauthorized change',
    }),
  });
  const leadBlocked = leadOverrideRes.status === 403;
  console.log(`2a. Non-super admin blocked: status=${leadOverrideRes.status} (expected 403)`);

  // 2b. Super admin attempts without confirmation -> 400 with "Confirmation required"
  const unconfirmedRes = await fetch(`${baseUrl}/api/settings/current-week-cutoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      confirmed: false,
    }),
  });
  const unconfirmedJson = await unconfirmedRes.json();
  const unconfirmedRejected = unconfirmedRes.status === 400 && unconfirmedJson.error?.includes('Confirmation required');
  console.log(`2b. Unconfirmed action rejected: status=${unconfirmedRes.status}, error="${unconfirmedJson.error}"`);

  // 2c. Super admin attempts with a past timestamp -> 400 with past rejection
  const pastTimeOverrideRes = await fetch(`${baseUrl}/api/settings/current-week-cutoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
      confirmed: true,
      reason: 'Attempting past cutoff override',
    }),
  });
  const pastTimeJson = await pastTimeOverrideRes.json();
  const pastTimeRejected = pastTimeOverrideRes.status === 400 && pastTimeJson.error?.includes('past');
  console.log(`2c. Past cutoff rejected: status=${pastTimeOverrideRes.status}, error="${pastTimeJson.error}"`);

  // 2d. Super admin valid future cutoff with explicit confirmation -> 200 OK + Audit Log
  const futureCutoff = new Date(Date.now() + 48 * 3600000); // 48 hours in future
  const validOverrideRes = await fetch(`${baseUrl}/api/settings/current-week-cutoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: futureCutoff.toISOString(),
      confirmed: true,
      reason: 'Team agreed to extend sprint by 2 days',
    }),
  });
  const validOverrideJson = await validOverrideRes.json();
  const overrideSucceeded = validOverrideRes.status === 200 && validOverrideJson.success === true;
  const cutoffUpdated = validOverrideJson.currentWeek?.cutoff_at === futureCutoff.toISOString();

  // Verify Audit Log entry was generated
  const auditLogsRes = await fetch(`${baseUrl}/api/settings/current-week-cutoff`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const auditLogsData = await auditLogsRes.json();
  const auditLogFound = auditLogsData.auditLogs?.some(
    (log) => log.action === 'change_current_week_cutoff' && log.details?.reason?.includes('Team agreed to extend')
  );

  console.log(`2d. Valid cutoff override succeeded: ${overrideSucceeded}, cutoff matches: ${cutoffUpdated}`);
  console.log(`    Audit log entry recorded and retrieved: ${auditLogFound}`);

  const check2Pass = leadBlocked && unconfirmedRejected && pastTimeRejected && overrideSucceeded && cutoffUpdated && auditLogFound;
  console.log(`Check 2 Result: ${check2Pass ? 'PASS' : 'FAIL'}\n`);
  if (!check2Pass) throw new Error('Check 2 failed');

  // ==============================================================================
  // Check 3: /api/tasks/assign calls public.close_week() when cutoff has passed
  // ==============================================================================
  console.log('--- Check 3: /api/tasks/assign delegates to canonical close_week() RPC ---');
  // 3a. Verify static code structure: assign/route.ts delegates directly to closeWeek()
  const assignCode = fs.readFileSync(path.join(process.cwd(), 'src/app/api/tasks/assign/route.ts'), 'utf8');
  const tasksLibCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/tasks.ts'), 'utf8');

  const assignCallsCloseWeek = assignCode.includes('await closeWeek(');
  const tasksLibCallsRpc = tasksLibCode.includes(".rpc('close_week'");
  const noCustomCloseInAssign = !assignCode.includes('weekScores.set') && !assignCode.includes('monthScores.set');

  console.log(`3a. Code inspection:`);
  console.log(`    /api/tasks/assign calls closeWeek(): ${assignCallsCloseWeek}`);
  console.log(`    closeWeek() calls .rpc('close_week'): ${tasksLibCallsRpc}`);
  console.log(`    Zero separate closing logic in assign route: ${noCustomCloseInAssign}`);

  // 3b. Functional verification:
  // When cutoff has passed, calling /api/tasks/assign closes the week via close_week() and targets next week
  const openWeekRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const { currentWeek: activeWeek } = await openWeekRes.json();
  const pastMeetingTime = new Date(new Date(activeWeek.cutoff_at).getTime() + 1000).toISOString();

  const assignAtPastCutoffRes = await fetch(`${baseUrl}/api/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      userId: alexPending.id,
      title: 'Sprint task assigned during meeting close transition',
      category: 'Platforms',
      size: 'small',
      note: 'Verifying canonical close delegation',
      simulatedNow: pastMeetingTime,
    }),
  });
  const assignPastJson = await assignAtPastCutoffRes.json();
  const functionalAssignPass = assignAtPastCutoffRes.status === 200 && assignPastJson.success === true && assignPastJson.task?.week_id !== activeWeek.id;

  console.log(`3b. Functional verification: status=${assignAtPastCutoffRes.status}, task assigned to next week: ${functionalAssignPass}`);

  const check3Pass = assignCallsCloseWeek && tasksLibCallsRpc && noCustomCloseInAssign && functionalAssignPass;
  console.log(`Check 3 Result: ${check3Pass ? 'PASS' : 'FAIL'}\n`);
  if (!check3Pass) throw new Error('Check 3 failed');

  console.log('================================================================');
  console.log('🎉 ALL 3 SAFETY FIX CHECKS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

runSafetyTestSuite().catch((err) => {
  console.error('Safety Test Suite Failed:', err);
  process.exit(1);
});
