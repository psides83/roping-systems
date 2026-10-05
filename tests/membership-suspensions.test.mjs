import assert from 'node:assert/strict';
import test from 'node:test';
import { suspensionStatus, validSuspensionDates } from '../src/lib/membership-suspensions.ts';

const suspension = { starts_on: '2026-10-05', ends_on: '2026-10-10', lifted_at: null };
test('suspension dates are inclusive and expire automatically', () => {
  assert.equal(suspensionStatus(suspension, '2026-10-04'), 'Scheduled');
  assert.equal(suspensionStatus(suspension, '2026-10-05'), 'Active');
  assert.equal(suspensionStatus(suspension, '2026-10-10'), 'Active');
  assert.equal(suspensionStatus(suspension, '2026-10-11'), 'Expired');
  assert.equal(suspensionStatus({ ...suspension, lifted_at: '2026-10-06T12:00:00Z' }, '2026-10-07'), 'Lifted');
});
test('dates must be real calendar dates in chronological order', () => {
  assert.equal(validSuspensionDates('2026-10-05', '2026-10-05'), true);
  assert.equal(validSuspensionDates('2026-10-05', '2026-10-10'), true);
  for (const [start, end] of [['2026-10-10', '2026-10-05'], ['', '2026-10-05'], ['2026-02-30', '2026-03-05'], ['2026-1-5', '2026-10-10']]) {
    assert.equal(validSuspensionDates(start, end), false);
  }
});
