import assert from 'node:assert/strict';
import test from 'node:test';
import { arenaOverview, overviewDate } from '../src/lib/events/arena-overview.ts';

export const roping = (overrides = {}) => ({ id: 'one', name: '#11.5 Tie-down', date: '2026-10-09', arena: 'Arena 1', order: 1, status: 'in_progress', rounds: 3, shortRound: false, shortRoundSeeded: false, shortRoundLocked: false, lockedRounds: [], note: null, ...overrides });
export const run = (overrides = {}) => ({ id: 'run', ropingId: 'one', round: 1, position: 1, status: 'pending', name: 'Morgan Reed', entry: 1, ...overrides });

test('default day follows active competition and rejects invalid date selection', () => {
  const items = [roping({ status: 'completed', date: '2026-10-08' }), roping()];
  assert.equal(overviewDate(items, undefined, '2026-10-08'), '2026-10-09');
  assert.equal(overviewDate(items, '2026-10-08', '2026-10-09'), '2026-10-08');
  assert.equal(overviewDate(items, 'invalid', '2026-10-08'), '2026-10-09');
});
test('arena progress counts unresolved reruns as remaining and excludes other rounds', () => {
  const [a] = arenaOverview([roping()], [run({ status: 'no_time' }), run({ id: 'rerun', status: 'rerun', position: 2 }), run({ id: 'pending', position: 3 }), run({ id: 'next-round', round: 2 })], '2026-10-09', 1);
  assert.equal(a.total, 3); assert.equal(a.resolved, 1); assert.equal(a.remaining, 2); assert.equal(a.reruns, 1);
  assert.equal(a.inBox.id, 'pending');
});
test('next contestant uses draw position, not fetch order', () => {
  const [a] = arenaOverview([roping()], [run({ id: 'last', position: 9 }), run({ id: 'first', position: 1 }), run({ id: 'second', position: 2 })], '2026-10-09', 1);
  assert.equal(a.inBox.id, 'first'); assert.equal(a.onDeck.id, 'second');
});
test('unbuilt draws and short-round review never claim a contestant is in the box', () => {
  assert.equal(arenaOverview([roping()], [run({ position: null })], '2026-10-09', 1)[0].inBox, null);
  const [a] = arenaOverview([roping({ shortRound: true, lockedRounds: [1, 2, 3], shortRoundSeeded: true })], [run({ round: 4 })], '2026-10-09', 1);
  assert.equal(a.round, 4); assert.equal(a.inBox, null); assert.match(a.issues.join(' '), /locking/);
});
test('two active ropings require a staff decision, not an arbitrary current desk', () => {
  const [a] = arenaOverview([roping(), roping({ id: 'two', order: 2 }), roping({ id: 'later', status: 'scheduled', order: 3 })], [run()], '2026-10-09', 1);
  assert.equal(a.current, null); assert.equal(a.target, null); assert.equal(a.inBox, null);
  assert.match(a.issues.join(' '), /Confirm which/);
});
test('arena assignment and first-available grouping keep separate desks separate', () => {
  const arenas = arenaOverview([roping(), roping({ id: 'two', arena: 'Arena 2' }), roping({ id: 'free', arena: null, status: 'scheduled' })], [], '2026-10-09', 2, 'Arena 2');
  assert.deepEqual(arenas.map(a => a.arena), ['Arena 2', 'First Available']);
  assert.equal(arenas[0].target.id, 'two');
  assert.match(arenas[1].issues.join(' '), /Assign an arena/);
});
test('completed ropings do not displace the next scheduled roping; days do not mix', () => {
  const [a] = arenaOverview([roping({ status: 'completed' }), roping({ id: 'next', status: 'scheduled', order: 2 }), roping({ id: 'tomorrow', date: '2026-10-10' })], [], '2026-10-09', 1);
  assert.equal(a.target.id, 'next'); assert.equal(a.current, null); assert.equal(a.items.length, 2);
});
test('locked rounds advance automatically and fully resolved rounds prompt completion', () => {
  const [a] = arenaOverview([roping({ lockedRounds: [1] })], [run({ round: 2, status: 'complete' })], '2026-10-09', 1);
  assert.equal(a.round, 2); assert.match(a.issues.join(' '), /Complete the round/);
});
test('a blocked next contestant is flagged, never silently skipped or labeled in the box', () => {
  const [a] = arenaOverview([roping()], [run({ fineBlocked: true }), run({ id: 'later', position: 2 })], '2026-10-09', 1);
  assert.equal(a.inBox, null); assert.match(a.issues.join(' '), /unpaid fine/); assert.equal(a.remaining, 2);
});
