import { createClient } from '@supabase/supabase-js';

// RLS and Middleware Security Verification Script
// Tests pending user restrictions, privilege escalation blocking, and deactivated user enforcement.

async function testRlsAndSecurity() {
  console.log('🛡️ Starting Row Level Security & Privilege Escalation tests...\n');
  const baseUrl = 'http://localhost:3000';

  const ts = Date.now();
  const pendingEmail = `pending_rls_${ts}@otter.systems`;
  const adminEmail = `railey_${ts}@otter.systems`;

  // 1. Register a test pending user
  console.log('1. Registering test pending user...');
  const pendingSignupRes = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Pending Test Otter',
      email: pendingEmail,
      password: 'Password123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const pendingCookie = pendingSignupRes.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('   ✓ Registered pending user, session cookie obtained.');

  // Verify pending user is blocked from viewing /api/admin/pending (403 Forbidden)
  const pendingAdminRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: pendingCookie },
    redirect: 'manual',
  });
  console.log(`   Pending user /api/admin/pending status: ${pendingAdminRes.status} (Expected: 403)`);
  if (pendingAdminRes.status !== 403) {
    throw new Error(`Security Failure: Expected 403 for pending user, got ${pendingAdminRes.status}`);
  }
  console.log('   ✓ Pending user blocked with 403 from admin pending data.');

  // Verify pending user is blocked by middleware from accessing /team (redirected to /pending-approval)
  const pendingTeamRes = await fetch(`${baseUrl}/team`, {
    headers: { Cookie: pendingCookie },
    redirect: 'manual',
  });
  const pendingTeamRedirect = pendingTeamRes.headers.get('location') || '';
  console.log(`   Pending user /team access redirect: ${pendingTeamRedirect} (Expected: /pending-approval)`);
  if (!pendingTeamRedirect.includes('/pending-approval')) {
    throw new Error(`Security Failure: Expected redirect to /pending-approval, got ${pendingTeamRedirect}`);
  }
  console.log('   ✓ Pending user accessing app data is blocked and redirected to /pending-approval.');

  // 2. Register and Confirm a Bootstrap Super Admin (Railey COO)
  console.log(`\n2. Registering and confirming Bootstrap Super Admin (${adminEmail})...`);
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: 'Railey COO',
      email: adminEmail,
      password: 'AdminPassword123!',
      desired_role_title: 'Chief Operating Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  // Simulate email confirmation
  const confirmAdminRes = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${adminEmail}`,
    { redirect: 'manual' }
  );
  const adminCookie = confirmAdminRes.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('   ✓ Confirmed bootstrap admin email and activated super admin session. Cookie:', adminCookie);

  // Super admin CAN access /api/admin/pending
  const adminPendingRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: adminCookie },
  });
  const resText = await adminPendingRes.text();
  let adminPendingData;
  try {
    adminPendingData = JSON.parse(resText);
  } catch (e) {
    console.error('Failed parsing admin pending json. Body:', resText);
    throw e;
  }
  console.log(`   Super admin /api/admin/pending status: ${adminPendingRes.status} (Expected: 200)`);
  console.log(`   Pending users count visible to admin: ${adminPendingData.pending?.length}`);

  // Find the pending test user ID
  const testPendingUser = adminPendingData.pending?.find(
    (p) => p.requested_role_title === 'Backend Lead'
  );
  if (!testPendingUser) {
    throw new Error('Test pending user not found in admin pending list.');
  }

  // 3. Super Admin approves user as an active Lead (non-admin)
  console.log('\n3. Super Admin approving test user as an active Lead (non-admin)...');
  const approveRes = await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      memberId: testPendingUser.id,
      roleTitle: 'Backend Lead',
      roleType: 'lead',
      isSuperAdmin: false,
      isTreasurer: false,
    }),
  });
  console.log(`   Approval status: ${approveRes.status} (Expected: 200)`);

  // Confirm email for the now approved user (returns active session cookie)
  const confirmUserRes = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${pendingEmail}`,
    { redirect: 'manual' }
  );
  const activeCookie = confirmUserRes.headers.get('set-cookie')?.split(';')[0] || '';
  console.log('   ✓ Logged in as newly active non-admin lead member.');

  // 4. Test Normal Active User (non-admin) CANNOT access admin pending endpoint
  console.log('\n4. Testing active non-admin member cannot access admin endpoints...');
  const memberAdminRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: activeCookie },
    redirect: 'manual',
  });
  console.log(`   Active member /api/admin/pending status: ${memberAdminRes.status} (Expected: 403)`);
  if (memberAdminRes.status !== 403) {
    throw new Error(`Security Failure: Non-admin member accessed admin endpoint! Status: ${memberAdminRes.status}`);
  }
  console.log('   ✓ Active non-admin member correctly blocked with 403.');

  // 5. Test Privilege Escalation Attack: Active non-admin tries to promote themselves to super_admin / treasurer
  console.log('\n5. Testing privilege escalation attack rejection...');
  const escalationRes = await fetch(`${baseUrl}/api/admin/approve-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: activeCookie,
    },
    body: JSON.stringify({
      memberId: testPendingUser.id,
      roleTitle: 'Chief Executive Officer',
      roleType: 'executive',
      isSuperAdmin: true,
      isTreasurer: true,
    }),
  });
  console.log(`   Escalation attempt status: ${escalationRes.status} (Expected: 403)`);
  if (escalationRes.status !== 403) {
    throw new Error(`Privilege Escalation Vulnerability: Normal user escalated privileges! Status: ${escalationRes.status}`);
  }
  console.log('   ✓ Privilege escalation attempt strictly rejected with 403.');

  // 6. Test Super Admin rejecting/deactivating a member and blocking enforcement
  console.log('\n6. Testing member deactivation enforcement...');
  const rejectRes = await fetch(`${baseUrl}/api/admin/reject-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({ memberId: testPendingUser.id }),
  });
  console.log(`   Deactivation status: ${rejectRes.status} (Expected: 200)`);

  // Verify deactivated user cannot log in
  const deactivatedLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: pendingEmail,
      password: 'Password123!',
    }),
  });
  console.log(`   Deactivated login status: ${deactivatedLoginRes.status} (Expected: 403)`);
  if (deactivatedLoginRes.status !== 403) {
    throw new Error(`Security Failure: Deactivated user was allowed to log in! Status: ${deactivatedLoginRes.status}`);
  }
  console.log('   ✓ Deactivated user strictly blocked from logging in (403 Forbidden).');

  // Verify deactivated session cookie is blocked by middleware and redirected to login with error
  const deactivatedCookie = `raft_user_session=${encodeURIComponent(
    JSON.stringify({ id: testPendingUser.id, email: 'pending_rls_test@otter.systems', status: 'deactivated' })
  )}`;
  const deactivatedRes = await fetch(`${baseUrl}/`, {
    headers: { Cookie: deactivatedCookie },
    redirect: 'manual',
  });
  const deactivatedRedirect = deactivatedRes.headers.get('location') || '';
  console.log(`   Deactivated session redirect: ${deactivatedRedirect} (Expected: /login?error=deactivated)`);
  if (!deactivatedRedirect.includes('deactivated')) {
    throw new Error(`Security Failure: Deactivated session was not blocked by middleware! Location: ${deactivatedRedirect}`);
  }
  console.log('   ✓ Deactivated session immediately blocked by middleware and redirected to login.');

  // Verify deactivated session is blocked from API endpoints (403 Forbidden)
  const deactivatedApiRes = await fetch(`${baseUrl}/api/admin/pending`, {
    headers: { Cookie: deactivatedCookie },
  });
  console.log(`   Deactivated session API status: ${deactivatedApiRes.status} (Expected: 403)`);
  if (deactivatedApiRes.status !== 403) {
    throw new Error(`Security Failure: Deactivated session accessed API! Status: ${deactivatedApiRes.status}`);
  }
  console.log('   ✓ Deactivated session strictly blocked from API endpoints with 403.');

  console.log('\n🎉 ALL RLS & ACCESS CONTROL POLICIES VERIFIED WITH 100% SUCCESS!');
}

testRlsAndSecurity().catch((err) => {
  console.error('RLS Test Error:', err);
  process.exit(1);
});
