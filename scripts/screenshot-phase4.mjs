import { chromium } from 'playwright';

async function capturePhase4Screenshots() {
  console.log('📸 Taking Phase 4 screenshots with Playwright...');
  const ts = Date.now();
  const testClientId = `phase4-screen-${ts}`;
  const baseUrl = 'http://localhost:3000';
  const testHeaders = { 'x-test-client-id': testClientId };

  // 1. Setup Super Admin (Christian CTO)
  const adminEmail = `christian_screen_${ts}@otter.systems`;
  const adminPassword = 'AdminPassword123!';

  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Christian CTO',
      email: adminEmail,
      password: adminPassword,
      desired_role_title: 'Chief Technology Officer',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  const confirmRes = await fetch(
    `${baseUrl}/auth/callback?simulate_confirm_email=${adminEmail}`,
    { redirect: 'manual', headers: testHeaders }
  );
  const rawCookies = confirmRes.headers.get('set-cookie') || '';
  const cookiePairs = rawCookies.split(',').map((c) => c.trim().split(';')[0]);

  const parsedCookies = [];
  for (const pair of cookiePairs) {
    const [name, ...valParts] = pair.split('=');
    if (name && valParts.length > 0) {
      parsedCookies.push({
        name: name.trim(),
        value: valParts.join('=').trim(),
        domain: 'localhost',
        path: '/',
      });
    }
  }

  // 2. Add some team members & login events so the console and logs look great
  const member1Email = `elena_lead_${ts}@otter.systems`;
  await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...testHeaders },
    body: JSON.stringify({
      full_name: 'Elena Rostova',
      email: member1Email,
      password: 'LeadPassword123!',
      desired_role_title: 'Frontend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  await fetch(`${baseUrl}/auth/callback?simulate_confirm_email=${member1Email}`, {
    redirect: 'manual',
    headers: testHeaders,
  });

  // Login log entries (1 failed, 1 successful)
  await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      ...testHeaders,
    },
    body: JSON.stringify({ email: member1Email, password: 'WrongPassword!' }),
  });

  await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121.0',
      ...testHeaders,
    },
    body: JSON.stringify({ email: member1Email, password: 'LeadPassword123!' }),
  });

  const browser = await chromium.launch({ headless: true });

  // Create desktop context
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: testHeaders,
  });
  if (parsedCookies.length > 0) {
    await desktopContext.addCookies(parsedCookies);
  }
  const desktopPage = await desktopContext.newPage();

  // 1. Desktop: /admin/users
  await desktopPage.goto(`${baseUrl}/admin/users`, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: 'scripts/admin-users-desktop.png', fullPage: true });
  console.log('  ✓ Saved scripts/admin-users-desktop.png');

  // 2. Desktop: /admin/login-log
  await desktopPage.goto(`${baseUrl}/admin/login-log`, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: 'scripts/admin-login-log-desktop.png', fullPage: true });
  console.log('  ✓ Saved scripts/admin-login-log-desktop.png');

  // 3. Desktop: /admin/mfa/enroll
  await desktopPage.goto(`${baseUrl}/admin/mfa/enroll`, { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: 'scripts/admin-mfa-enroll-desktop.png', fullPage: true });
  console.log('  ✓ Saved scripts/admin-mfa-enroll-desktop.png');

  // Create mobile context
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: testHeaders,
  });
  if (parsedCookies.length > 0) {
    await mobileContext.addCookies(parsedCookies);
  }
  const mobilePage = await mobileContext.newPage();

  // 4. Mobile: /admin/users
  await mobilePage.goto(`${baseUrl}/admin/users`, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: 'scripts/admin-users-mobile.png', fullPage: true });
  console.log('  ✓ Saved scripts/admin-users-mobile.png');

  // 5. Mobile: /admin/login-log
  await mobilePage.goto(`${baseUrl}/admin/login-log`, { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: 'scripts/admin-login-log-mobile.png', fullPage: true });
  console.log('  ✓ Saved scripts/admin-login-log-mobile.png');

  await browser.close();
  console.log('🎉 All screenshots taken successfully!');
}

capturePhase4Screenshots().catch((err) => {
  console.error('Screenshot error:', err);
  process.exit(1);
});
