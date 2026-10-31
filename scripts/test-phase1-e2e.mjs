import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runTests() {
  console.log('🚀 Running revised Phase 1 E2E tests (Self-Service, Approval, Rate-Limiting)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Unauthenticated redirect test
  console.log('1. Testing unauthenticated redirect...');
  await page.goto('http://localhost:3000/');
  await page.waitForURL('**/login', { timeout: 10000 });
  console.log('   ✓ Unauthenticated redirected to /login');

  // Capture Login Screenshots
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'login-revised-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'login-revised-desktop.png') });

  // 2. Test Invalid Team Join Code on Signup
  console.log('2. Testing invalid Team Join Code rejection...');
  await page.goto('http://localhost:3000/signup');
  await page.fill('input[placeholder="e.g. Christian Grey"]', 'Marcus Vance');
  await page.fill('input[placeholder="name@otter.systems"]', 'marcus@otter.systems');
  await page.fill('input[type="password"][placeholder="••••••••••••"]', 'MarcusPass123!');
  await page.fill('input[placeholder="Enter secret team join code"]', 'WRONG-CODE');
  await page.click('button[type="submit"]');

  // Verify rejection
  await page.waitForSelector('text=Invalid Team Join Code', { timeout: 5000 });
  console.log('   ✓ Invalid join code correctly rejected by server');

  // 3. Test Valid Signup for Regular Member (starts as Pending)
  console.log('3. Testing valid self-service signup for regular member...');
  await page.fill('input[placeholder="Enter secret team join code"]', 'OTTER-RAFT-2026');
  await page.click('button[type="submit"]');

  // Must redirect to /pending-approval
  await page.waitForURL('**/pending-approval', { timeout: 10000 });
  console.log('   ✓ Successfully routed new user to /pending-approval');

  // Screenshots of Pending Approval Screen
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'pending-approval-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'pending-approval-desktop.png') });

  // 4. Test Pending User is BLOCKED from reading app data
  console.log('4. Testing pending user blocked from accessing app data...');
  await page.goto('http://localhost:3000/');
  await page.waitForURL('**/pending-approval', { timeout: 5000 });
  console.log('   ✓ Pending user navigating to / blocked -> redirected to /pending-approval');

  await page.goto('http://localhost:3000/team');
  await page.waitForURL('**/pending-approval', { timeout: 5000 });
  console.log('   ✓ Pending user navigating to /team blocked -> redirected to /pending-approval');

  await page.goto('http://localhost:3000/my-week');
  await page.waitForURL('**/pending-approval', { timeout: 5000 });
  console.log('   ✓ Pending user navigating to /my-week blocked -> redirected to /pending-approval');

  // 5. Sign Out
  console.log('5. Signing out pending user...');
  await page.click('button:has-text("Sign Out")');
  await page.waitForURL('**/login', { timeout: 5000 });
  console.log('   ✓ Signed out to /login');

  // 6. Test Bootstrap Super Admin Registration (Christian)
  console.log('6. Testing Bootstrap Super Admin signup (christian@otter.systems)...');
  await page.goto('http://localhost:3000/signup');
  await page.fill('input[placeholder="e.g. Christian Grey"]', 'Christian');
  await page.fill('input[placeholder="name@otter.systems"]', 'christian@otter.systems');
  await page.fill('input[type="password"][placeholder="••••••••••••"]', 'ChristianPass2026!');
  await page.fill('input[placeholder="Enter secret team join code"]', 'OTTER-RAFT-2026');
  await page.click('button[type="submit"]');

  // Bootstrap admin should be auto-approved and land straight on Home (/)
  await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('   ✓ Bootstrap Super Admin auto-approved and landed on Home (/)');

  // 7. Test Super Admin Approving Pending Member in /admin/pending
  console.log('7. Testing Super Admin reviewing and approving pending member...');
  await page.goto('http://localhost:3000/admin/pending');
  await page.waitForSelector('text=Marcus Vance', { timeout: 5000 });
  console.log('   ✓ Marcus Vance visible in pending list');

  // Screenshot Admin Pending Console
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'admin-pending-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'admin-pending-desktop.png') });

  // Click "Approve & Activate"
  await page.click('button:has-text("Approve & Activate")');
  await page.waitForSelector('text=All Clear! No Pending Requests', { timeout: 5000 });
  console.log('   ✓ Marcus Vance approved by Super Admin!');

  // Sign out Christian
  await page.goto('http://localhost:3000/settings');
  await page.click('button:has-text("Sign Out")');
  await page.waitForURL('**/login', { timeout: 5000 });

  // 8. Test Marcus Vance logging in as approved active member
  console.log('8. Testing approved member login...');
  await page.fill('input[placeholder="name@otter.systems"]', 'marcus@otter.systems');
  await page.fill('input[type="password"][placeholder="••••••••••••"]', 'MarcusPass123!');
  await page.click('button[type="submit"]');

  await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('   ✓ Marcus Vance logged in and successfully landed on Home (/)');

  // Verify access to /team
  await page.goto('http://localhost:3000/team');
  await page.waitForSelector('text=Marcus Vance', { timeout: 5000 });
  console.log('   ✓ Marcus Vance verified on Team roster');

  // 9. Test Rate Limiting on Login
  console.log('9. Testing server-side rate limiting on login endpoint...');
  let hitRateLimit = false;
  for (let i = 0; i < 12; i++) {
    const res = await page.request.post('http://localhost:3000/api/auth/login', {
      data: { email: 'fake@otter.systems', password: 'badpassword' },
    });
    if (res.status() === 429) {
      hitRateLimit = true;
      console.log(`   ✓ Rate limit triggered on attempt ${i + 1} with status 429`);
      break;
    }
  }

  if (!hitRateLimit) {
    throw new Error('Rate limit was expected to trigger within 12 rapid attempts.');
  }

  await browser.close();
  console.log('🎉 All revised Phase 1 flow tests passed with 100% success!');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
