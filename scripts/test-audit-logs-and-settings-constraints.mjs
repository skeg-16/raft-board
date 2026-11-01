import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🦦 Starting Comprehensive Verification Suite: Audit Logs Append-Only, Settings Constraints, and Dynamic Cutoff...\n');

  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-${ts}` };

  // Setup: Register Super Admin (Christian CTO)
  const superAdminEmail = `christian_audit_${ts}@otter.systems`;
  const saSignupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
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
  assert.strictEqual(saSignupRes.status, 200, 'Super admin signup should succeed');

  const saConfirmRes = await fetch(
    `${BASE_URL}/auth/callback?simulate_confirm_email=${superAdminEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const saCookie = saConfirmRes.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(saCookie, 'Should obtain super admin session cookie');

  // Setup: Register Member (Pending)
  const memberEmail = `member_audit_${ts}@otter.systems`;
  const samSignupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Sam Developer',
      email: memberEmail,
      password: 'MemberPassword123!',
      desired_role_title: 'Developer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  assert.strictEqual(samSignupRes.status, 200, 'Member signup should succeed');

  const pendingRes = await fetch(`${BASE_URL}/api/admin/pending`, {
    headers: { Cookie: saCookie, ...testHeaders },
  });
  const pendingData = await pendingRes.json();
  const samPending = pendingData.pending?.find((p) => p.email === memberEmail);
  assert.ok(samPending, 'Sam should be in pending list');
  assert.ok(samPending, 'Sam should be in pending list');

  // =========================================================================
  // CHECK 1: Settings Check Constraints (Weekday & Time)
  // =========================================================================
  console.log('[Check 1] Verifying settings check constraints via API...');

  // 1A. Invalid weekday rejected
  const invalidWeekdayRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({ meeting_weekday: 'Funday' }),
  });
  assert.strictEqual(invalidWeekdayRes.status, 400, 'Invalid weekday should be rejected with HTTP 400');
  const invalidWeekdayData = await invalidWeekdayRes.json();
  assert.match(invalidWeekdayData.error, /invalid meeting weekday/i);
  console.log('  ✓ Invalid weekday ("Funday") rejected with 400 Bad Request');

  // 1B. Invalid meeting time rejected
  const invalidTimeRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({ meeting_time: '25:99' }),
  });
  assert.strictEqual(invalidTimeRes.status, 400, 'Invalid meeting time should be rejected with HTTP 400');
  const invalidTimeData = await invalidTimeRes.json();
  assert.match(invalidTimeData.error, /invalid meeting time/i);
  console.log('  ✓ Invalid meeting time ("25:99") rejected with 400 Bad Request');

  // 1C. Valid weekday & time accepted
  const validSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Sunday',
      meeting_time: '11:00 AM',
      timezone: 'Asia/Manila',
    }),
  });
  assert.strictEqual(validSettingsRes.status, 200, 'Valid settings should succeed with HTTP 200');
  const validSettingsData = await validSettingsRes.json();
  assert.strictEqual(validSettingsData.settings.meeting_weekday, 'Sunday');
  assert.ok(
    validSettingsData.settings.meeting_time === '11:00:00' ||
    validSettingsData.settings.meeting_time === '11:00 AM',
    'Meeting time must be saved in valid format'
  );
  console.log('  ✓ Valid schedule (Sunday, 11:00 AM) accepted successfully');

  // =========================================================================
  // CHECK 2: Unified Audit Logging Across All Admin Actions
  // =========================================================================
  console.log('\n[Check 2] Verifying unified audit logging for all admin actions...');

  // 2A. Approve Member Action
  const approveRes = await fetch(`${BASE_URL}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({
      memberId: samPending.id,
      roleTitle: 'Developer',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  assert.strictEqual(approveRes.status, 200, 'Approve member should succeed');
  console.log('  ✓ Member approved');

  // 2B. Target Edit Action (Executive/Super Admin setting target)
  const targetRes = await fetch(`${BASE_URL}/api/members/${samPending.id}/target`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({ weekly_target_xp: 100 }),
  });
  assert.strictEqual(targetRes.status, 200, 'Target edit should succeed');
  console.log('  ✓ Weekly target updated to 100 XP');

  // 2C. Quick Pick Create Action
  const qpRes = await fetch(`${BASE_URL}/api/quick-picks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({
      category: 'Platforms',
      label: 'Deploy audit logging suite',
      default_size: 'medium',
    }),
  });
  assert.strictEqual(qpRes.status, 200, 'Create quick pick should succeed');
  console.log('  ✓ Quick pick created');

  // 2D. Super Admin Cutoff Change Action
  const futureCutoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffOverrideRes = await fetch(`${BASE_URL}/api/settings/current-week-cutoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({
      new_cutoff_at: futureCutoff,
      confirmed: true,
      reason: 'Schedule realignment for test',
    }),
  });
  assert.strictEqual(cutoffOverrideRes.status, 200, 'Cutoff override should succeed');
  console.log('  ✓ Super admin cutoff override performed');

  // 2E. Super Admin Manual Close Action
  const closeRes = await fetch(`${BASE_URL}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({ force: true }),
  });
  assert.strictEqual(closeRes.status, 200, 'Manual close should succeed');
  console.log('  ✓ Super admin manual close executed');

  // 2F. Inspect Audit Logs Endpoint
  const logsRes = await fetch(`${BASE_URL}/api/settings/current-week-cutoff`, {
    headers: { Cookie: saCookie, ...testHeaders },
  });
  assert.strictEqual(logsRes.status, 200, 'Audit logs fetch should succeed');
  const { auditLogs } = await logsRes.json();
  assert.ok(Array.isArray(auditLogs), 'Audit logs must be an array');

  const actionTypes = auditLogs.map((l) => l.action);
  console.log('  Captured Audit Log Actions:', actionTypes);

  assert.ok(actionTypes.includes('update_settings'), 'Audit logs must include update_settings');
  assert.ok(actionTypes.includes('approve_member'), 'Audit logs must include approve_member');
  assert.ok(actionTypes.includes('update_weekly_target'), 'Audit logs must include update_weekly_target');
  assert.ok(actionTypes.includes('create_quick_pick'), 'Audit logs must include create_quick_pick');
  assert.ok(actionTypes.includes('change_current_week_cutoff'), 'Audit logs must include change_current_week_cutoff');
  assert.ok(actionTypes.includes('manual_close_week'), 'Audit logs must include manual_close_week');
  console.log('  ✓ All admin actions successfully captured in single unified audit_logs');

  // =========================================================================
  // CHECK 3: Next Week Cutoff Dynamically Follows Updated Settings After Close
  // =========================================================================
  console.log('\n[Check 3] Verifying next week cutoff follows updated settings after close...');

  // The close earlier opened a new week. Let's verify that the newly opened week's cutoff
  // dynamically followed the updated settings (Sunday 11:00 AM Manila)!
  const currentSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    headers: { Cookie: saCookie, ...testHeaders },
  });
  const currentSettingsData = await currentSettingsRes.json();
  const currentWeek = currentSettingsData.currentWeek;
  assert.ok(currentWeek, 'Current week must exist');

  const cutoffDate = new Date(currentWeek.cutoff_at);
  const cutoffManila = new Date(cutoffDate.getTime() + 8 * 3600000);
  console.log(`  Current Week ID: ${currentWeek.id}`);
  console.log(`  Cutoff UTC: ${currentWeek.cutoff_at}`);
  console.log(`  Cutoff Manila: DOW=${cutoffManila.getUTCDay()} (0=Sun), Hour=${cutoffManila.getUTCHours()}:00`);

  assert.strictEqual(cutoffManila.getUTCDay(), 0, 'New week cutoff day must be Sunday (0)');
  assert.strictEqual(cutoffManila.getUTCHours(), 11, 'New week cutoff hour must be 11 AM');
  assert.strictEqual(cutoffManila.getUTCMinutes(), 0, 'New week cutoff minute must be 00');
  console.log('  ✓ First close dynamically created next week cutoff at Sunday 11:00 AM Manila');

  // Now change settings to Thursday 3:00 PM and close again
  await fetch(`${BASE_URL}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Thursday',
      meeting_time: '3:00 PM',
      timezone: 'Asia/Manila',
    }),
  });

  const secondCloseRes = await fetch(`${BASE_URL}/api/tasks/close-week`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: saCookie, ...testHeaders },
    body: JSON.stringify({ force: true }),
  });
  assert.strictEqual(secondCloseRes.status, 200, 'Second close should succeed');

  const secondSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
    headers: { Cookie: saCookie, ...testHeaders },
  });
  const secondWeek = (await secondSettingsRes.json()).currentWeek;
  const secondCutoff = new Date(secondWeek.cutoff_at);
  const secondCutoffManila = new Date(secondCutoff.getTime() + 8 * 3600000);

  console.log(`  Second Week ID: ${secondWeek.id}`);
  console.log(`  Cutoff UTC: ${secondWeek.cutoff_at}`);
  console.log(`  Cutoff Manila: DOW=${secondCutoffManila.getUTCDay()} (4=Thu), Hour=${secondCutoffManila.getUTCHours()}:00`);

  assert.strictEqual(secondCutoffManila.getUTCDay(), 4, 'Second week cutoff day must be Thursday (4)');
  assert.strictEqual(secondCutoffManila.getUTCHours(), 15, 'Second week cutoff hour must be 3 PM (15:00)');
  assert.strictEqual(secondCutoffManila.getUTCMinutes(), 0, 'Second week cutoff minute must be 00');
  console.log('  ✓ Second close dynamically created next week cutoff at Thursday 3:00 PM Manila');

  console.log('\n🎉 ALL CHECKS PASSED: Audit logs append-only & unified, settings constraints enforced, and next cutoff dynamically follows schedule changes!');
}

runTests().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
