// Comprehensive Test Suite for:
// 1. pg_cron schedule every minute (* * * * *)
// 2. Executive assignment at Saturday meeting cutoff & 3 minutes after (goes to next week)
// 3. Changing meeting time to earlier today (passed) and changing weekday
// 4. Cutoff countdown and 30-min amber warning
const baseUrl = 'http://localhost:3000';
import fs from 'fs';
import path from 'path';

async function runTestSuite() {
  console.log('🦦 Starting Tests for Scheduling, Assignment at Cutoff, Settings Shifts, and Countdown...\n');
  const ts = Date.now();
  const testHeaders = { 'x-test-client-id': `test-${ts}` };

  // Setup: Register Super Admin (Christian CTO)
  const superAdminEmail = `christian_sch_${ts}@otter.systems`;
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
  const leadEmail = `alex_sch_${ts}@otter.systems`;
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
  console.log('Super Admin & Alex Lead setup complete.\n');

  // ==============================================================================
  // Check 1: pg_cron schedule is '* * * * *' (every minute, not tied to a weekday in UTC)
  // ==============================================================================
  console.log('--- Check 1: pg_cron schedule every minute (* * * * *) ---');
  const mig7 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261101000007_weekly_close_refinements.sql'), 'utf8');
  const mig8 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261101000008_every_minute_cron_and_assignment.sql'), 'utf8');

  const hasEveryMinuteInMig7 = mig7.includes("'* * * * *'") && mig7.includes('select public.close_week();');
  const hasEveryMinuteInMig8 = mig8.includes("'* * * * *'") && mig8.includes('select public.close_week();');
  const check1Pass = hasEveryMinuteInMig7 && hasEveryMinuteInMig8;
  console.log(`Check 1 Result: ${check1Pass ? 'PASS' : 'FAIL'} (mig 7: ${hasEveryMinuteInMig7}, mig 8: ${hasEveryMinuteInMig8})\n`);
  if (!check1Pass) throw new Error('Check 1 failed');

  // ==============================================================================
  // Check 2: Executive assignment at cutoff and 3 minutes after (goes to next week)
  // ==============================================================================
  console.log('--- Check 2: Assignment at Saturday meeting cutoff & 3 minutes after ---');
  // Get current week
  const weekRes = await fetch(`${baseUrl}/api/settings`, {
    headers: { Cookie: superAdminCookie, ...testHeaders },
  });
  const { currentWeek } = await weekRes.json();
  const cutoffTime = new Date(currentWeek.cutoff_at).getTime();

  // 2a. Assign exactly AT the cutoff (time = cutoff_at)
  const simulatedAtCutoff = new Date(cutoffTime).toISOString();
  const assignAtCutoffRes = await fetch(`${baseUrl}/api/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      userId: alexPending.id,
      title: 'Design API Specs during Saturday meeting',
      category: 'Platforms',
      size: 'medium',
      note: 'Assigned right at meeting start',
      simulatedNow: simulatedAtCutoff,
    }),
  });
  const assignAtCutoffData = await assignAtCutoffRes.json();
  const assignedAtCutoffSuccess = assignAtCutoffRes.status === 200 && assignAtCutoffData.success === true;
  const wentToNextWeekAtCutoff = assignAtCutoffData.task?.week_id !== currentWeek.id;

  console.log(`2a. Assigned at cutoff: status=${assignAtCutoffRes.status}, success=${assignedAtCutoffSuccess}, targetWeek=${assignAtCutoffData.task?.week_id} (oldWeek was ${currentWeek.id})`);

  // 2b. Assign 3 minutes AFTER the cutoff (time = cutoff_at + 3 mins)
  const simulated3MinAfter = new Date(cutoffTime + 3 * 60 * 1000).toISOString();
  const assign3MinRes = await fetch(`${baseUrl}/api/tasks/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      userId: alexPending.id,
      title: 'Sprint planning task 3m into Saturday meeting',
      category: 'Management',
      size: 'big',
      note: 'Assigned 3 minutes into meeting',
      simulatedNow: simulated3MinAfter,
    }),
  });
  const assign3MinData = await assign3MinRes.json();
  const assigned3MinSuccess = assign3MinRes.status === 200 && assign3MinData.success === true;
  const wentToNextWeek3Min = assign3MinData.task?.week_id !== currentWeek.id;

  console.log(`2b. Assigned 3m after cutoff: status=${assign3MinRes.status}, success=${assigned3MinSuccess}, targetWeek=${assign3MinData.task?.week_id}`);

  const check2Pass = assignedAtCutoffSuccess && wentToNextWeekAtCutoff && assigned3MinSuccess && wentToNextWeek3Min;
  console.log(`Check 2 Result: ${check2Pass ? 'PASS' : 'FAIL'}\n`);
  if (!check2Pass) throw new Error('Check 2 failed');

  // ==============================================================================
  // Check 3: Change meeting time to earlier today (already passed) and change weekday
  // ==============================================================================
  console.log('--- Check 3: Settings update to earlier time today (passed) and changing weekday ---');

  // 3a. Changing meeting time to an earlier time that has already passed today
  // Let's determine today's weekday in Asia/Manila
  const now = new Date();
  const manilaNow = new Date(now.getTime() + 8 * 3600000);
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayManilaWeekday = weekdayNames[manilaNow.getUTCDay()];

  // Change meeting_weekday to today, and meeting_time to 01:00 AM (which has already passed today)
  const updateToPassedRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: todayManilaWeekday,
      meeting_time: '01:00 AM',
    }),
  });
  const updateToPassedData = await updateToPassedRes.json();
  const newCutoffPassed = new Date(updateToPassedData.currentWeek.cutoff_at);
  const isCutoffInPast = now.getTime() >= newCutoffPassed.getTime();

  console.log(`3a. Meeting time set to 01:00 AM today (${todayManilaWeekday}):`);
  console.log(`    Current UTC: ${now.toISOString()}`);
  console.log(`    New Cutoff UTC: ${newCutoffPassed.toISOString()}`);
  console.log(`    Is cutoff in past? (Week immediately locked): ${isCutoffInPast}`);

  // 3b. Change weekday to Friday
  const updateWeekdayRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Friday',
      meeting_time: '05:00 PM',
    }),
  });
  const updateWeekdayData = await updateWeekdayRes.json();
  const fridayCutoff = new Date(updateWeekdayData.currentWeek.cutoff_at);
  const fridayCutoffManila = new Date(fridayCutoff.getTime() + 8 * 3600000);
  const isFridayCutoff = fridayCutoffManila.getUTCDay() === 5; // 5 = Friday
  const is5PM = fridayCutoffManila.getUTCHours() === 17 && fridayCutoffManila.getUTCMinutes() === 0;

  console.log(`3b. Weekday changed to Friday 05:00 PM:`);
  console.log(`    New Cutoff UTC: ${fridayCutoff.toISOString()}`);
  console.log(`    Cutoff day is Friday: ${isFridayCutoff}, Time is 5:00 PM: ${is5PM}`);

  // Restore settings to Saturday 10:00 AM
  await fetch(`${baseUrl}/api/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdminCookie, ...testHeaders },
    body: JSON.stringify({
      meeting_weekday: 'Saturday',
      meeting_time: '10:00 AM',
    }),
  });

  const check3Pass = updateToPassedRes.status === 200 && isCutoffInPast && updateWeekdayRes.status === 200 && isFridayCutoff && is5PM;
  console.log(`Check 3 Result: ${check3Pass ? 'PASS' : 'FAIL'}\n`);
  if (!check3Pass) throw new Error('Check 3 failed');

  // ==============================================================================
  // Check 4: Countdown UI component logic on /my-week (amber at <= 30 minutes)
  // ==============================================================================
  console.log('--- Check 4: Cutoff countdown on /my-week with 30-min amber warning ---');
  const myWeekSource = fs.readFileSync(path.join(process.cwd(), 'src/app/my-week/page.tsx'), 'utf8');
  const hasCountdownState = myWeekSource.includes('countdown') && myWeekSource.includes('isUrgent');
  const hasAmberThreshold = myWeekSource.includes('diff <= 30 * 60 * 1000');
  const hasAmberClasses = myWeekSource.includes('bg-amber-500/25') || myWeekSource.includes('bg-amber-500/15');
  const hasUrgentIndicator = myWeekSource.includes('Closing Soon') && myWeekSource.includes('On Track');
  const hasCutoffBanner = myWeekSource.includes('data-testid="cutoff-countdown-banner"');

  const check4Pass = hasCountdownState && hasAmberThreshold && hasAmberClasses && hasUrgentIndicator && hasCutoffBanner;
  console.log(`Check 4 Result: ${check4Pass ? 'PASS' : 'FAIL'} (Countdown state: ${hasCountdownState}, 30m threshold: ${hasAmberThreshold}, Amber styling: ${hasAmberClasses})\n`);
  if (!check4Pass) throw new Error('Check 4 failed');

  console.log('================================================================');
  console.log('🎉 ALL CHECKS PASSED: Scheduling, Cutoff Assignments, Settings, and Countdown!');
  console.log('================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
