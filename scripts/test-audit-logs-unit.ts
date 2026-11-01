import assert from 'node:assert';
import {
  getStores,
  isValidWeekday,
  isValidMeetingTime,
  normalizeTimeToPostgres,
  deriveWeekBoundaries,
  logAdminAction,
} from '../src/lib/tasks';

async function runUnitTests() {
  console.log('🧪 Running Unit Tests for Append-Only Audit Logs and Constraint Helpers...');

  const { auditLogs } = getStores();

  // Test 1: Append-Only Map
  const entry = await logAdminAction('user-123', 'unit_test_action', { test: true });
  assert.ok(entry.id);
  assert.strictEqual(entry.action, 'unit_test_action');

  let deleteThrew = false;
  try {
    auditLogs.delete(entry.id);
  } catch (err: any) {
    deleteThrew = true;
    assert.match(err.message, /strictly append-only/i);
  }
  assert.ok(deleteThrew, 'Deleting an audit log must throw');

  let clearThrew = false;
  try {
    auditLogs.clear();
  } catch (err: any) {
    clearThrew = true;
    assert.match(err.message, /strictly append-only/i);
  }
  assert.ok(clearThrew, 'Clearing audit logs must throw');

  let overwriteThrew = false;
  try {
    auditLogs.set(entry.id, { ...entry, action: 'tampered' });
  } catch (err: any) {
    overwriteThrew = true;
    assert.match(err.message, /strictly append-only/i);
  }
  assert.ok(overwriteThrew, 'Mutating an existing audit log must throw');
  console.log('  ✓ AppendOnlyAuditLogMap prevents delete, clear, and modification');

  // Test 2: Validation Helpers
  assert.strictEqual(isValidWeekday('Saturday'), true);
  assert.strictEqual(isValidWeekday('sunday'), true);
  assert.strictEqual(isValidWeekday('Friday'), true);
  assert.strictEqual(isValidWeekday('NotADay'), false);
  assert.strictEqual(isValidWeekday(''), false);
  console.log('  ✓ isValidWeekday correctly validates DOW');

  assert.strictEqual(isValidMeetingTime('10:00 AM'), true);
  assert.strictEqual(isValidMeetingTime('14:30'), true);
  assert.strictEqual(isValidMeetingTime('10:00:00'), true);
  assert.strictEqual(isValidMeetingTime('2:30 PM'), true);
  assert.strictEqual(isValidMeetingTime('25:00'), false);
  assert.strictEqual(isValidMeetingTime('12:60'), false);
  assert.strictEqual(isValidMeetingTime('random'), false);
  console.log('  ✓ isValidMeetingTime correctly validates time strings');

  // Test 3: Postgres Time Normalization
  assert.strictEqual(normalizeTimeToPostgres('10:00 AM'), '10:00:00');
  assert.strictEqual(normalizeTimeToPostgres('2:30 PM'), '14:30:00');
  assert.strictEqual(normalizeTimeToPostgres('14:30'), '14:30:00');
  console.log('  ✓ normalizeTimeToPostgres standardizes meeting_time to HH:MM:SS');

  console.log('🎉 ALL UNIT CHECKS PASSED!\n');
}

runUnitTests().catch((e) => {
  console.error('Unit tests failed:', e);
  process.exit(1);
});
