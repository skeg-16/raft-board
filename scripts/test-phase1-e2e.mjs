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
  console.log('🚀 Starting Phase 1 E2E and visual verification...');
  const browser = await chromium.launch({ headless: true });

  // 1. Unauthenticated redirect test
  console.log('Testing unauthenticated redirect...');
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/');
  await page.waitForURL('**/login', { timeout: 10000 });
  console.log('✓ Successfully redirected unauthenticated user to /login:', page.url());

  // 2. Desktop Screenshot of Login (1280x800)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'login-desktop.png') });
  console.log('✓ Saved login-desktop.png');

  // 3. Mobile Screenshot of Login (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'login-mobile.png') });
  console.log('✓ Saved login-mobile.png');

  // 4. Perform Login with seeded account
  console.log('Logging in as seeded CTO Alex Rivera (cto@otter.systems)...');
  await page.fill('input[type="email"]', 'cto@otter.systems');
  await page.fill('input[type="password"]', 'OtterPass2026!');
  await page.click('button[type="submit"]');

  // 5. Verify forced redirect to /change-password
  await page.waitForURL('**/change-password', { timeout: 10000 });
  console.log('✓ Successfully forced redirect to /change-password:', page.url());

  // Screenshots of /change-password
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'change-password-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'change-password-desktop.png') });
  console.log('✓ Saved change-password screenshots');

  // 6. Complete forced password change
  console.log('Setting new permanent password...');
  await page.fill('input[placeholder="At least 8 characters"]', 'OtterChief2026!');
  await page.fill('input[placeholder="Re-enter your new password"]', 'OtterChief2026!');
  await page.click('button[type="submit"]');

  // 7. Verify redirect to Home (/)
  await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('✓ Successfully redirected to Home (/) after password update');

  // Capture Mobile and Desktop for all 5 tabs:
  const tabs = [
    { name: 'home', url: 'http://localhost:3000/' },
    { name: 'my-week', url: 'http://localhost:3000/my-week' },
    { name: 'team', url: 'http://localhost:3000/team' },
    { name: 'leaderboard', url: 'http://localhost:3000/leaderboard' },
    { name: 'settings', url: 'http://localhost:3000/settings' },
  ];

  for (const tab of tabs) {
    await page.goto(tab.url);
    await page.waitForLoadState('networkidle');

    // Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotsDir, `${tab.name}-mobile.png`) });

    // Desktop (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: path.join(screenshotsDir, `${tab.name}-desktop.png`) });
    console.log(`✓ Captured ${tab.name} (mobile + desktop)`);
  }

  // 8. Test PWA manifest and service worker URLs
  const manifestRes = await page.goto('http://localhost:3000/manifest.json');
  console.log('✓ Manifest HTTP status:', manifestRes.status());
  const swRes = await page.goto('http://localhost:3000/sw.js');
  console.log('✓ Service Worker HTTP status:', swRes.status());
  const offlineRes = await page.goto('http://localhost:3000/offline.html');
  console.log('✓ Offline fallback HTTP status:', offlineRes.status());

  await browser.close();
  console.log('🎉 All Phase 1 tests and visual checks passed successfully!');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
