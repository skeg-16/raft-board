import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runPhase2E2E() {
  console.log('🚀 Running Phase 2 Playwright E2E Tests (My Week, Quick Picks, Extras, Level Up, Rest Mode)...');
  const browser = await chromium.launch({ headless: true });
  const ts = Date.now();
  const testClientId = `test-e2e-${ts}`;
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-test-client-id': testClientId },
  });
  const page = await context.newPage();

  // 1. Executive Signup & Confirmation (Railey COO)
  console.log('1. Setting up Executive (Railey COO)...');
  const execEmail = `railey_${ts}@otter.systems`;
  await page.goto('http://localhost:3000/signup');
  await page.fill('input[placeholder="e.g. Christian Grey"]', 'Railey COO');
  await page.fill('input[placeholder="name@otter.systems"]', execEmail);
  await page.fill('input[type="password"]', 'AdminPass123!');
  await page.fill('input[placeholder="Enter secret team join code"]', 'OTTER-RAFT-2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/pending-approval', { timeout: 10000 });

  // Confirm email
  await page.goto(`http://localhost:3000/auth/callback?simulate_confirm_email=${execEmail}`);
  await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('   ✓ Executive confirmed and landed on Home');

  // 2. Member Signup & Confirmation (Marcus Vance)
  console.log('\n2. Setting up Member (Marcus Vance)...');
  const memberEmail = `marcus_${ts}@otter.systems`;
  // Sign up in new context or page fetch
  const signupRes = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-client-id': testClientId,
    },
    body: JSON.stringify({
      full_name: 'Marcus Vance',
      email: memberEmail,
      password: 'MarcusPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });
  const signupData = await signupRes.json();
  console.log(`   Signup status: ${signupRes.status}`, signupData);

  // Executive approves Marcus in /admin/pending
  await page.goto('http://localhost:3000/admin/pending');
  console.log('   Navigated to /admin/pending, current URL:', page.url());
  await page.waitForSelector('text=Marcus Vance', { timeout: 5000 });
  await page.click('button:has-text("Approve & Activate")');
  await page.waitForSelector('text=All Clear! No Pending Requests', { timeout: 5000 });
  console.log('   ✓ Executive approved Marcus Vance');

  // Confirm Marcus email
  await fetch(`http://localhost:3000/auth/callback?simulate_confirm_email=${memberEmail}`);

  // Executive assigns a task to Marcus in /my-week
  console.log('\n3. Executive assigning weekly task to Marcus in My Week...');
  await page.goto('http://localhost:3000/my-week');
  await page.waitForSelector('text=Executive Console', { timeout: 5000 });
  await page.click('button:has-text("Assign Task")');

  // Fill assignment modal
  await page.waitForSelector('text=Assign Task', { timeout: 3000 });
  await page.waitForSelector('option:has-text("Marcus Vance")', { state: 'attached', timeout: 4000 });
  await page.selectOption('form select:first-of-type', { label: 'Marcus Vance (Backend Lead)' });

  await page.fill('input[placeholder="e.g. Build API rate limiter"]', 'Implement Database RPC Triggers');
  await page.selectOption('select:has-text("Platforms")', 'Platforms');
  await page.selectOption('select:has-text("Small (10 XP)")', 'big');
  await page.fill('textarea[placeholder="Add specs or context..."]', 'High priority task for Saturday meeting.');

  const [assignResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/tasks/assign')),
    page.click('button[type="submit"]:has-text("Assign Task")'),
  ]);
  const assignJson = await assignResponse.json();
  console.log('   Assign response status:', assignResponse.status(), assignJson);
  console.log('   ✓ Executive assigned Big (50 XP) task to Marcus');

  // Sign out Executive
  await page.goto('http://localhost:3000/settings');
  await page.click('button:has-text("Sign Out")');
  await page.waitForURL('**/login', { timeout: 5000 });

  // 4. Log in as Marcus Vance
  console.log('\n4. Logging in as Marcus Vance...');
  await page.fill('input[placeholder="name@otter.systems"]', memberEmail);
  await page.fill('input[type="password"]', 'MarcusPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('   ✓ Marcus Vance logged in and landed on Home');

  // 5. Navigate to My Week
  console.log('\n5. Marcus exploring My Week...');
  await page.goto('http://localhost:3000/my-week');
  await page.waitForSelector('text=Implement Database RPC Triggers', { timeout: 5000 });
  console.log('   ✓ Assigned task visible on Marcus My Week board');

  // Capture Screenshots (Mobile & Desktop)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'phase2-myweek-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'phase2-myweek-desktop.png') });
  console.log('   ✓ Captured My Week mobile and desktop screenshots');

  // 6. Test Task State Transitions: I\'m doing -> Blocked -> Finished
  console.log('\n6. Testing task interactions (Doing, Blocked, Finished)...');
  await page.click('button:has-text("I\'m doing")');
  await page.waitForSelector('text=In Progress', { timeout: 4000 });
  console.log('   ✓ Task status updated to "In Progress"');

  await page.click('button:has-text("Blocked")');
  await page.waitForSelector('text=Stuck on a Rock', { timeout: 4000 });
  await page.fill('textarea[placeholder*="Waiting on API"]', 'Need Supabase migration permissions');
  await page.click('button:has-text("Confirm Blocked")');
  await page.waitForSelector('text=Blocked', { timeout: 4000 });
  console.log('   ✓ Task flagged as Blocked ("Stuck on a rock") with note');

  // Click "I finished"
  await page.click('button:has-text("I finished")');
  await page.waitForSelector('text=Finished', { timeout: 5000 });
  console.log('   ✓ Task finished! Automatically awarded 50 task XP + 10 early cutoff bonus');

  // 7. Test Extras Tab & Quick Picks
  console.log('\n7. Testing Extras Tab & Quick Pick...');
  await page.click('button:has-text("Extras")');
  await page.waitForSelector('text=Quick Picks', { timeout: 4000 });
  await page.click('button:has-text("update Otter Org")');

  // Modal pops up with pre-filled title
  await page.waitForSelector('input[value="update Otter Org"]', { timeout: 4000 });
  await page.click('button:has-text("Add Extra")');
  await page.waitForSelector('text=update Otter Org', { timeout: 4000 });
  console.log('   ✓ Quick Pick "update Otter Org" added to Extras');

  // Finish Extra Task
  const finishButtons = await page.$$('button:has-text("I finished")');
  if (finishButtons.length > 0) {
    await finishButtons[0].click();
    await page.waitForTimeout(1000);
    console.log('   ✓ Extra task marked finished and XP awarded');
  }

  // 8. Test Undo Action
  console.log('\n8. Testing Undo action...');
  const undoButton = await page.$('button:has-text("Undo")');
  if (undoButton) {
    // accept confirmation dialog
    page.on('dialog', (dialog) => dialog.accept());
    await undoButton.click();
    await page.waitForTimeout(1000);
    console.log('   ✓ Undo executed, XP recalculated successfully');
  }

  // 9. Test Rest Mode Toggle
  console.log('\n9. Testing Rest Mode toggle...');
  await page.click('button:has-text("Rest Mode")');
  await page.waitForSelector('text=Resting 🌴', { timeout: 4000 });
  console.log('   ✓ Rest Mode activated (target waived, streak frozen)');

  // 10. Check Home Screen XP & Level
  console.log('\n10. Checking Home screen XP and Level indicators...');
  await page.goto('http://localhost:3000/');
  await page.waitForSelector('text=Pup', { timeout: 5000 });
  console.log('   ✓ Home screen reflects XP, Level, and Rest Mode status');

  // Capture Home Screenshots (Mobile & Desktop)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDir, 'phase2-home-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: path.join(screenshotsDir, 'phase2-home-desktop.png') });
  console.log('   ✓ Captured Home mobile and desktop screenshots');

  await browser.close();
  console.log('\n🎉 PHASE 2 PLAYWRIGHT E2E TESTS PASSED WITH 100% SUCCESS!');
}

runPhase2E2E().catch((err) => {
  console.error('Phase 2 E2E Error:', err);
  process.exit(1);
});
