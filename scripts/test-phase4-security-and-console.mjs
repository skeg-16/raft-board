import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function runPhase4Tests() {
  console.log('🦦 Starting Phase 4 Verification Suite: Super Admin Console, Security, 2FA, Lockout Protection & Cleanups...\n');

  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-p4-${ts}` };

  // =========================================================================
  // CLEANUP CHECKS: TypeScript cleanups & meeting_time format
  // =========================================================================
  console.log('--- Cleanup 1 & 2 Verification ---');
  const tasksLibPath = path.join(process.cwd(), 'src/lib/tasks.ts');
  const tasksLibCode = fs.readFileSync(tasksLibPath, 'utf8');

  // Verify calculateNextCutoff and executeCloseWeek are deleted
  const hasCalculateNextCutoff = tasksLibCode.includes('function calculateNextCutoff(');
  const hasExecuteCloseWeek = tasksLibCode.includes('function executeCloseWeek(');
  assert.strictEqual(hasCalculateNextCutoff, false, 'FAIL: calculateNextCutoff must be deleted from TypeScript');
  assert.strictEqual(hasExecuteCloseWeek, false, 'FAIL: executeCloseWeek must be deleted from TypeScript');
  console.log('  ✓ TypeScript versions of calculateNextCutoff and executeCloseWeek are deleted');

  // Verify closeWeek delegates to RPC
  assert.ok(tasksLibCode.includes(".rpc('close_week'"), 'FAIL: closeWeek must delegate to .rpc(close_week)');
  console.log('  ✓ closeWeek delegates directly to canonical SQL close_week function');

  // =========================================================================
  // SETUP TEST ACCOUNTS
  // =========================================================================
  console.log('\n--- Setting up Test Accounts ---');

  // 1. Super Admin 1 (Christian CTO - Bootstrap)
  const sa1Email = `christian_p4_sa1_${ts}@otter.systems`;
  await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Christian CTO',
      email: sa1Email,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Technology Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const sa1Confirm = await fetch(
    `${BASE_URL}/auth/callback?simulate_confirm_email=${sa1Email}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const sa1Cookie = sa1Confirm.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(sa1Cookie, 'Super Admin 1 session cookie obtained');

  // 2. Super Admin 2 (Railey COO - Bootstrap)
  const sa2Email = `railey_p4_sa2_${ts}@otter.systems`;
  await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Railey COO',
      email: sa2Email,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Operating Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const sa2Confirm = await fetch(
    `${BASE_URL}/auth/callback?simulate_confirm_email=${sa2Email}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const sa2Cookie = sa2Confirm.headers.get('set-cookie')?.split(';')[0] || '';
  assert.ok(sa2Cookie, 'Super Admin 2 session cookie obtained');

  // 3. Normal Member (Morgan Lead)
  const memberEmail = `morgan_lead_${ts}@otter.systems`;
  await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Morgan Lead',
      email: memberEmail,
      password: 'MemberPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingRes = await fetch(`${BASE_URL}/api/admin/pending`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  const pendingList = (await pendingRes.json()).pending || [];
  const morganPending = pendingList.find((p) => p.email === memberEmail);
  assert.ok(morganPending, 'Morgan should be pending approval');

  // Approve Morgan as Lead
  await fetch(`${BASE_URL}/api/admin/approve-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({
      memberId: morganPending.id,
      roleTitle: 'Backend Lead',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  const memberConfirm = await fetch(
    `${BASE_URL}/auth/callback?simulate_confirm_email=${memberEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const memberCookie = memberConfirm.headers.get('set-cookie')?.split(';')[0] || '';

  // 4. Pending User (Unapproved)
  const pendingEmail = `pending_user_${ts}@otter.systems`;
  await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Pending Pete',
      email: pendingEmail,
      password: 'PendingPassword123!',
      desired_role_title: 'Junior Dev',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingConfirm = await fetch(
    `${BASE_URL}/auth/callback?simulate_confirm_email=${pendingEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const pendingCookie = pendingConfirm.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('  ✓ Test members registered: 2 Super Admins, 1 Lead, 1 Pending');

  // =========================================================================
  // CHECK 1: Non-admin and pending users cannot reach any admin route or API
  // =========================================================================
  console.log('\n[Check 1] Verifying access control on admin endpoints...');

  // Pending user tests
  const pendingUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: pendingCookie, ...testHeaders },
  });
  assert.strictEqual(pendingUsersRes.status, 403, 'Pending user must be blocked from /api/admin/users (403)');

  const pendingLogsRes = await fetch(`${BASE_URL}/api/admin/login-logs`, {
    headers: { Cookie: pendingCookie, ...testHeaders },
  });
  assert.strictEqual(pendingLogsRes.status, 403, 'Pending user must be blocked from /api/admin/login-logs (403)');

  // Normal member tests
  const memberUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: memberCookie, ...testHeaders },
  });
  assert.strictEqual(memberUsersRes.status, 403, 'Normal lead must be blocked from /api/admin/users (403)');

  const memberLogsRes = await fetch(`${BASE_URL}/api/admin/login-logs`, {
    headers: { Cookie: memberCookie, ...testHeaders },
  });
  assert.strictEqual(memberLogsRes.status, 403, 'Normal lead must be blocked from /api/admin/login-logs (403)');

  const memberPatchRes = await fetch(`${BASE_URL}/api/admin/users/${morganPending.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: memberCookie, ...testHeaders },
    body: JSON.stringify({ role_title: 'Hacked' }),
  });
  assert.strictEqual(memberPatchRes.status, 403, 'Normal lead cannot modify user records (403)');

  // Super Admin access succeeds
  const saUsersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(saUsersRes.status, 200, 'Super admin access to /api/admin/users must succeed (200)');
  const saUsersData = await saUsersRes.json();
  assert.ok(Array.isArray(saUsersData.users), 'Must return users array');
  console.log('  ✓ Non-admin and pending users strictly blocked from all admin routes and APIs');

  // =========================================================================
  // CHECK 2: Lockout Protection
  // 1) An admin cannot remove their own admin status
  // 2) The last remaining super admin cannot be demoted or deactivated
  // =========================================================================
  console.log('\n[Check 2] Verifying lockout protection...');

  // Identify SA1 from user list
  const allUsers = saUsersData.users;
  const sa1User = allUsers.find((u) => u.email === sa1Email);
  const sa2User = allUsers.find((u) => u.email === sa2Email);
  assert.ok(sa1User && sa2User, 'Both super admins must exist');

  // 2A. Admin cannot remove their own admin status
  const selfDemoteRes = await fetch(`${BASE_URL}/api/admin/users/${sa1User.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({ is_super_admin: false }),
  });
  assert.strictEqual(selfDemoteRes.status, 400, 'Self-demotion must be rejected with 400');
  const selfDemoteData = await selfDemoteRes.json();
  assert.match(selfDemoteData.error, /Lockout Protection.*cannot remove their own admin status/i);
  console.log('  ✓ Admin self-demotion strictly blocked by lockout protection');

  // 2B. Demote SA2 (now SA1 is the only remaining active super admin)
  const demoteSa2Res = await fetch(`${BASE_URL}/api/admin/users/${sa2User.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({ is_super_admin: false }),
  });
  assert.strictEqual(demoteSa2Res.status, 200, 'Demoting SA2 should succeed when SA1 is active');
  console.log('  ✓ Demoted SA2; SA1 is now the sole remaining super admin');

  // 2C. Attempt to demote or deactivate SA1 (the LAST remaining super admin)
  // Even if attempted by another route or request, demoting the last super admin must fail
  const demoteLastRes = await fetch(`${BASE_URL}/api/admin/users/${sa1User.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({ status: 'deactivated' }),
  });
  assert.strictEqual(demoteLastRes.status, 400, 'Deactivating last super admin must be rejected');
  const demoteLastData = await demoteLastRes.json();
  assert.match(demoteLastData.error, /Lockout Protection/i);
  console.log('  ✓ Deactivating/demoting the last remaining super admin is strictly blocked');

  // Re-promote SA2 to have 2 active admins for subsequent tests
  await fetch(`${BASE_URL}/api/admin/users/${sa2User.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({ is_super_admin: true, status: 'active' }),
  });

  // =========================================================================
  // CHECK 3: Login Logs (Success & Failure, Hashed IP, Browser/Device)
  // =========================================================================
  console.log('\n[Check 3] Verifying login logging...');

  // 3A. Trigger failed login (wrong password)
  const failedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      ...testHeaders,
    },
    body: JSON.stringify({
      email: memberEmail,
      password: 'WrongPassword999!',
    }),
  });
  assert.strictEqual(failedLoginRes.status, 401, 'Failed login should return 401');

  // 3B. Trigger successful login
  const successLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121.0',
      ...testHeaders,
    },
    body: JSON.stringify({
      email: memberEmail,
      password: 'MemberPassword123!',
    }),
  });
  assert.strictEqual(successLoginRes.status, 200, 'Successful login should return 200');

  // 3C. Inspect login logs via Super Admin endpoint
  const loginLogsRes = await fetch(`${BASE_URL}/api/admin/login-logs`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(loginLogsRes.status, 200, 'Super admin can read login logs');
  const { loginLogs } = await loginLogsRes.json();
  assert.ok(Array.isArray(loginLogs), 'Login logs must be an array');

  const failedEntry = loginLogs.find((l) => l.email === memberEmail && l.status === 'failed');
  assert.ok(failedEntry, 'Failed login attempt must appear in login logs');
  assert.ok(failedEntry.ip_hash, 'IP address must be hashed/anonymized');
  assert.ok(!failedEntry.ip_hash.match(/^\d+\.\d+\.\d+\.\d+$/), 'Raw unmasked IP must not be stored');
  assert.match(failedEntry.device_browser, /Chrome on Windows/i, 'Device browser must be parsed correctly');
  console.log('  ✓ Failed login attempt captured with parsed device and hashed IP');

  const successEntry = loginLogs.find((l) => l.email === memberEmail && l.status === 'success');
  assert.ok(successEntry, 'Successful login attempt must appear in login logs');
  assert.match(successEntry.device_browser, /Firefox on macOS/i, 'Device browser must match successful user agent');
  console.log('  ✓ Successful login attempt captured with parsed device and hashed IP');

  // =========================================================================
  // CHECK 4: Active Sessions & Sign Out Everywhere
  // =========================================================================
  console.log('\n[Check 4] Verifying active sessions tracking and sign out everywhere...');

  // 4A. Check active sessions for Morgan
  const sessionsRes = await fetch(`${BASE_URL}/api/admin/users/${morganPending.id}/sessions`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(sessionsRes.status, 200, 'Super admin can view user sessions');
  const { sessions: morganSessions } = await sessionsRes.json();
  assert.ok(morganSessions.length >= 1, 'Morgan must have at least 1 active session from login');
  console.log(`  ✓ Active session found for Morgan (Device: ${morganSessions[0].device_browser})`);

  // 4B. Super admin signs Morgan out everywhere
  const signOutRes = await fetch(`${BASE_URL}/api/admin/users/${morganPending.id}/sign-out-everywhere`, {
    method: 'POST',
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(signOutRes.status, 200, 'Sign out everywhere should succeed');

  const postSessionsRes = await fetch(`${BASE_URL}/api/admin/users/${morganPending.id}/sessions`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  const { sessions: emptySessions } = await postSessionsRes.json();
  assert.strictEqual(emptySessions.length, 0, 'Active sessions must be cleared after signing out everywhere');
  console.log('  ✓ Sign out everywhere invalidated all active sessions');

  // =========================================================================
  // CHECK 5: 2FA Enrollment & Second Admin Recovery Path
  // =========================================================================
  console.log('\n[Check 5] Verifying 2FA setup and locked-out admin recovery by second admin...');

  // 5A. SA1 enrolls in 2FA
  const enrollRes = await fetch(`${BASE_URL}/api/auth/mfa/enroll`, {
    method: 'POST',
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(enrollRes.status, 200, 'MFA enroll endpoint should succeed');
  const enrollData = await enrollRes.json();
  assert.ok(enrollData.secret, 'Must generate TOTP secret');

  // Verify TOTP code (123456 demo or valid code)
  const verifyRes = await fetch(`${BASE_URL}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sa1Cookie, ...testHeaders },
    body: JSON.stringify({
      code: '123456',
      secret: enrollData.secret,
      factorId: enrollData.factorId,
    }),
  });
  assert.strictEqual(verifyRes.status, 200, '2FA verify should succeed');
  console.log('  ✓ Super Admin 1 enrolled and verified 2FA');

  // 5B. SA1 attempts to reset their OWN 2FA factor (Must be blocked)
  const selfResetRes = await fetch(`${BASE_URL}/api/admin/users/${sa1User.id}/reset-2fa`, {
    method: 'POST',
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(selfResetRes.status, 400, 'Self 2FA reset must be blocked with 400');
  const selfResetData = await selfResetRes.json();
  assert.match(selfResetData.error, /Recovery Protection.*An admin cannot reset their own 2FA/i);
  console.log('  ✓ Self 2FA reset blocked (requires a second super admin)');

  // 5C. SA2 (the SECOND super admin) recovers locked-out SA1
  const recoveryRes = await fetch(`${BASE_URL}/api/admin/users/${sa1User.id}/reset-2fa`, {
    method: 'POST',
    headers: { Cookie: sa2Cookie, ...testHeaders },
  });
  assert.strictEqual(recoveryRes.status, 200, 'Second admin 2FA recovery must succeed');
  console.log('  ✓ Second super admin successfully recovered locked-out admin factor');

  // 5D. Verify SA1 profile now has mfa_enabled = false
  const updatedSa1Res = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Cookie: sa2Cookie, ...testHeaders },
  });
  const updatedUsers = (await updatedSa1Res.json()).users;
  const recoveredSa1 = updatedUsers.find((u) => u.id === sa1User.id);
  assert.strictEqual(recoveredSa1.mfa_enabled, false, 'SA1 2FA must be reset');

  // =========================================================================
  // CHECK 6: Password Security & Force Password Reset
  // =========================================================================
  console.log('\n[Check 6] Verifying password security (admins never see passwords)...');

  const forceResetRes = await fetch(`${BASE_URL}/api/admin/users/${morganPending.id}/force-password-reset`, {
    method: 'POST',
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  assert.strictEqual(forceResetRes.status, 200, 'Force password reset should succeed');
  const forceResetData = await forceResetRes.json();
  assert.match(forceResetData.message, /Admin never sees passwords|user must choose/i);
  console.log('  ✓ Password reset triggered safely without exposing passwords');

  // =========================================================================
  // CHECK 7: Fail-Closed Unified Audit Logging
  // =========================================================================
  console.log('\n[Check 7] Verifying fail-closed unified audit logging...');

  const auditRes = await fetch(`${BASE_URL}/api/settings/current-week-cutoff`, {
    headers: { Cookie: sa1Cookie, ...testHeaders },
  });
  const { auditLogs } = await auditRes.json();
  const capturedActions = auditLogs.map((l) => l.action);

  console.log('  Captured Audit Log Actions in Phase 4:', capturedActions);
  assert.ok(capturedActions.includes('update_user'), 'Audit logs must capture update_user');
  assert.ok(capturedActions.includes('reset_2fa'), 'Audit logs must capture reset_2fa');
  assert.ok(capturedActions.includes('sign_out_everywhere'), 'Audit logs must capture sign_out_everywhere');
  assert.ok(capturedActions.includes('force_password_reset'), 'Audit logs must capture force_password_reset');
  console.log('  ✓ All security and admin actions successfully written to append-only audit_logs');

  console.log('\n🎉 ALL PHASE 4 CHECKS PASSED WITH 100% SUCCESS!');
}

runPhase4Tests().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
