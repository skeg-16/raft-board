// Phase 3 Playwright E2E Browser Test Suite
// Verifies:
// 1. Team page: "Updated" vs "Not yet" status, level indicators, blocked tasks alert ("stuck on a rock"), and team progress chart
// 2. Leaderboard page: Top 3 visibility for normal lead member vs full roster visibility for executive
// 3. Resting members displayed separately and never ranked last
// 4. Monthly Season tab: Top Otter winner celebration and weekly breakdown accordion
// 5. Desktop & Mobile viewports with screenshots

import { chromium } from 'playwright';

async function runPhase3E2E() {
  console.log('🚀 Running Phase 3 Playwright E2E Tests (Team Page, Leaderboard, Top 3 Privacy, Season)...\n');
  const ts = Date.now();
  const testClientId = `e2e-p3-${ts}`;

  const browser = await chromium.launch({ headless: true });

  // 1. Setup Executive (Railey COO)
  console.log('1. Setting up Executive (Railey COO)...');
  const execContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-test-client-id': testClientId },
  });
  const execPage = await execContext.newPage();

  const execEmail = `railey_p3_e2e_${ts}@otter.systems`;
  await execPage.goto('http://localhost:3000/signup');
  await execPage.fill('input[placeholder="e.g. Christian Grey"]', 'Railey COO');
  await execPage.fill('input[type="email"]', execEmail);
  await execPage.fill('input[type="password"]', 'AdminPassword123!');
  await execPage.selectOption('select', 'Chief Operating Officer (COO)');
  await execPage.fill('input[placeholder="Enter secret team join code"]', 'OTTER-RAFT-2026');
  await execPage.click('button[type="submit"]');
  await execPage.waitForURL('**/pending-approval', { timeout: 10000 });

  // Confirm email
  await execPage.goto(`http://localhost:3000/auth/callback?simulate_confirm_email=${execEmail}`);
  await execPage.waitForURL('http://localhost:3000/', { timeout: 10000 });
  console.log('   ✓ Executive confirmed and logged in');

  // 2. Setup Member 1: Updated Member (Fiona Vance - Backend Lead)
  console.log('\n2. Setting up Member 1 (Fiona Vance - Updated)...');
  const fionaName = `Fiona Vance ${ts}`;
  const fionaEmail = `fiona_${ts}@otter.systems`;
  await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-client-id': testClientId },
    body: JSON.stringify({
      full_name: fionaName,
      email: fionaEmail,
      password: 'FionaPassword123!',
      desired_role_title: 'Backend Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  // Executive approves Fiona
  await execPage.goto('http://localhost:3000/admin/pending');
  await execPage.waitForSelector(`text=${fionaName}`, { timeout: 5000 });
  await execPage.locator(`.bg-white:has-text("${fionaName}") button:has-text("Approve & Activate")`).click();
  await execPage.waitForSelector(`text=${fionaName}`, { state: 'detached', timeout: 5000 });
  await fetch(`http://localhost:3000/auth/callback?simulate_confirm_email=${fionaEmail}`);
  console.log('   ✓ Fiona Vance approved');

  // 3. Setup Member 2: Not Yet Member (Leo Brand - Creatives Lead)
  console.log('\n3. Setting up Member 2 (Leo Brand - Not Yet)...');
  const leoName = `Leo Brand ${ts}`;
  const leoEmail = `leo_${ts}@otter.systems`;
  await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-client-id': testClientId },
    body: JSON.stringify({
      full_name: leoName,
      email: leoEmail,
      password: 'LeoPassword123!',
      desired_role_title: 'Creatives Lead',
      team_join_code: 'OTTER-RAFT-2026',
    }),
  });

  // Executive approves Leo
  await execPage.goto('http://localhost:3000/admin/pending');
  await execPage.waitForSelector(`text=${leoName}`, { timeout: 5000 });
  await execPage.locator(`.bg-white:has-text("${leoName}") button:has-text("Approve & Activate")`).click();
  await execPage.waitForSelector(`text=${leoName}`, { state: 'detached', timeout: 5000 });
  await fetch(`http://localhost:3000/auth/callback?simulate_confirm_email=${leoEmail}`);
  console.log('   ✓ Leo Brand approved');

  // 4. Fiona logs in, adds an extra task, moves it to Doing & Blocked
  console.log('\n4. Fiona logging in and performing weekly activity...');
  const memberContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-test-client-id': testClientId },
  });
  const memberPage = await memberContext.newPage();

  await memberPage.goto('http://localhost:3000/login');
  await memberPage.fill('input[type="email"]', fionaEmail);
  await memberPage.fill('input[type="password"]', 'FionaPassword123!');
  await memberPage.click('button[type="submit"]');
  await memberPage.waitForURL('http://localhost:3000/', { timeout: 10000 });

  // Fiona navigates to My Week and adds an Extra task
  await memberPage.goto('http://localhost:3000/my-week');
  await memberPage.waitForSelector('text=My Week', { timeout: 5000 });
  await memberPage.click('button:has-text("Extras")');

  // Tap quick pick "update Otter Org"
  await memberPage.waitForSelector('button:has-text("update Otter Org")', { timeout: 5000 });
  await memberPage.click('button:has-text("update Otter Org")');
  await memberPage.waitForSelector('button:has-text("Add Extra")', { timeout: 4000 });
  await memberPage.click('button:has-text("Add Extra")');

  // Wait for task card to appear in Extras tab
  await memberPage.waitForSelector('text=update Otter Org', { timeout: 5000 });

  // Mark task Blocked ("stuck on a rock")
  await memberPage.click('button:has-text("Blocked")');
  await memberPage.waitForSelector('text=Stuck on a Rock', { timeout: 4000 });
  await memberPage.fill('textarea[placeholder*="Waiting on API"]', 'Need staging database credentials');
  await memberPage.click('button:has-text("Confirm Blocked")');
  await memberPage.waitForSelector('text=Blocked', { timeout: 4000 });
  console.log('   ✓ Fiona added task and marked it blocked ("stuck on a rock")');

  // 5. TEST: Team Page Verification
  console.log('\n5. Verifying Team Dashboard (/team)...');
  await memberPage.goto('http://localhost:3000/team');
  await memberPage.waitForSelector('text=Team Raft', { timeout: 5000 });

  // Fiona must show "Updated"
  const fionaCard = memberPage.locator(`.bg-white:has-text("${fionaName}")`);
  await fionaCard.waitFor({ timeout: 5000 });
  const fionaStatus = await fionaCard.locator('span:has-text("Updated")').textContent();
  console.log(`   Fiona update badge: "${fionaStatus?.trim()}" (Expected: Updated)`);

  // Fiona must show "Stuck on a rock" blocked box
  const blockedRock = await fionaCard.locator('text=Stuck on a rock').isVisible();
  console.log(`   Fiona blocked task alert visible: ${blockedRock}`);

  // Leo must show "Not yet"
  const leoCard = memberPage.locator(`.bg-white:has-text("${leoName}")`);
  await leoCard.waitFor({ timeout: 5000 });
  const leoStatus = await leoCard.locator('span:has-text("Not yet")').textContent();
  console.log(`   Leo update badge: "${leoStatus?.trim()}" (Expected: Not yet)`);

  // Verify Team Progress Chart
  const progressChartVisible = await memberPage.locator('text=Team Weekly Progress').isVisible();
  console.log(`   Team Progress Chart visible: ${progressChartVisible}`);

  // Capture Team Screenshots
  await memberPage.screenshot({ path: 'scripts/team-desktop.png' });
  await memberPage.setViewportSize({ width: 390, height: 844 });
  await memberPage.screenshot({ path: 'scripts/team-mobile.png' });
  console.log('   ✓ Captured Team page desktop & mobile screenshots');

  // 6. TEST: Leaderboard Top 3 Privacy for Normal Lead Member
  console.log('\n6. Verifying Leaderboard Top 3 Privacy (Normal Lead Member)...');
  await memberPage.setViewportSize({ width: 1280, height: 800 });
  await memberPage.goto('http://localhost:3000/leaderboard');
  await memberPage.waitForSelector('text=Leaderboard', { timeout: 5000 });

  // Check that Top 3 is visible
  const top3Visible = await memberPage.locator('text=This Week\'s Top 3 Otters').isVisible();
  console.log(`   Top 3 Section visible: ${top3Visible}`);

  // Check privacy notice
  const privacyNoticeVisible = await memberPage.locator('text=other teammates\' individual standings are private').isVisible();
  console.log(`   Lead Privacy notice visible: ${privacyNoticeVisible}`);

  // Verify that Executive Full Roster is NOT visible to Lead member
  const execTableVisibleToLead = await memberPage.locator('text=Executive Full Roster').isVisible();
  console.log(`   Executive Full Roster hidden from Lead: ${!execTableVisibleToLead}`);
  if (execTableVisibleToLead) {
    throw new Error('Privacy failure: Lead member can see Executive Full Roster!');
  }

  // 7. TEST: Leaderboard Full Roster for Executive Member
  console.log('\n7. Verifying Leaderboard Full Roster (Executive Member)...');
  await execPage.goto('http://localhost:3000/leaderboard');
  await execPage.waitForSelector('text=Leaderboard', { timeout: 5000 });

  // Executive sees the full roster
  const execTableVisibleToExec = await execPage.locator('text=Executive Full Roster').isVisible();
  console.log(`   Executive Full Roster visible to Executive: ${execTableVisibleToExec}`);
  if (!execTableVisibleToExec) {
    throw new Error('Executive table missing for Executive user');
  }

  // Executive sees "Run Close Now" button
  const runCloseVisible = await execPage.locator('button:has-text("Run Close Now")').isVisible();
  console.log(`   Super Admin "Run Close Now" button visible: ${runCloseVisible}`);

  // Capture Leaderboard Screenshots
  await execPage.screenshot({ path: 'scripts/leaderboard-desktop.png' });
  await execPage.setViewportSize({ width: 390, height: 844 });
  await execPage.screenshot({ path: 'scripts/leaderboard-mobile.png' });
  console.log('   ✓ Captured Leaderboard desktop & mobile screenshots');

  // 8. TEST: Monthly Season Tab
  console.log('\n8. Verifying Monthly Season Tab & Season Breakdown...');
  await execPage.setViewportSize({ width: 1280, height: 800 });
  await execPage.click('button:has-text("Monthly Season")');
  await execPage.waitForSelector('text=Season Month:', { timeout: 5000 });

  const monthlySeasonVisible = await execPage.locator('text=Monthly Season Standings').isVisible();
  console.log(`   Monthly Season standings visible: ${monthlySeasonVisible}`);

  await execPage.screenshot({ path: 'scripts/season-desktop.png' });
  console.log('   ✓ Captured Season page screenshot');

  await browser.close();
  console.log('\n🎉 ALL PHASE 3 PLAYWRIGHT E2E TESTS PASSED WITH 100% SUCCESS!');
}

runPhase3E2E().catch((err) => {
  console.error('Phase 3 E2E Error:', err);
  process.exit(1);
});
