import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSeasonStandings, qualifiesForStandings } from '../src/lib/season-standings.ts';

const season = { startsOn: '2026-05-01', endsOn: '2027-04-30' };
const entry = (roperId, classId, winningsCents, overrides = {}) => ({
  roperId, classId, winningsCents, ropingId: 'roping-1', date: '2026-06-01', official: true, ...overrides,
});
const move = (overrides = {}) => ({ id: 'move-1', roperId: 'a', fromClassId: '11', toClassId: '10',
  date: '2026-07-01', capAtLeader: false, classLadder: ['12', '11', '10', '9'], ...overrides });

test('all award pools count while multiple awards and entries count one roping', () => {
  const { rows } = calculateSeasonStandings([
    entry('a', '11', 10000), entry('a', '11', 2500), entry('a', '11', 1500),
    entry('a', '11', 0, { ropingId: 'roping-2' }),
  ], [], season);
  assert.equal(rows[0].winningsCents, 14000);
  assert.equal(rows[0].ropingsEntered, 2);
});

test('unofficial, other-season, and post-cutoff results do not count', () => {
  const { rows } = calculateSeasonStandings([
    entry('a', '11', 100, { official: false }),
    entry('a', '11', 100, { date: '2026-04-30' }),
    entry('a', '11', 100, { date: '2026-08-01' }),
  ], [], season, '2026-07-01');
  assert.deepEqual(rows, []);
});

test('earnings and attendance belong to the class competed in', () => {
  const { rows } = calculateSeasonStandings([entry('number-15', '11.5', 100)], [], season);
  assert.equal(rows[0].classId, '11.5');
});

test('ties share rank and all tied ropers qualify at cutoff', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 300), entry('b', '11', 200),
    entry('c', '11', 200), entry('d', '11', 100)], [], season);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 2, 4]);
  assert.equal(qualifiesForStandings(rows[2], { topPlaces: 2, minimumRopings: 1 }), true);
  assert.equal(qualifiesForStandings(rows[2], { topPlaces: 2, minimumRopings: 2 }), false);
});

test('moves shift existing lower-number winnings separately and retain actual attendance', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 200000), entry('a', '10', 100000)], [move()], season);
  const byClass = new Map(rows.map(row => [row.classId, row]));
  assert.equal(byClass.get('11').winningsCents, 0);
  assert.equal(byClass.get('10').winningsCents, 200000);
  assert.equal(byClass.get('9').winningsCents, 100000);
  assert.equal(byClass.get('9').ropingsEntered, 0);
});

test('optional carryover cap uses target class leader and records excluded money', () => {
  const { rows, carryovers } = calculateSeasonStandings([
    entry('a', '11', 800000), entry('leader', '10', 600000),
  ], [move({ capAtLeader: true })], season);
  assert.equal(rows.find(row => row.roperId === 'a' && row.classId === '10').winningsCents, 600000);
  assert.equal(carryovers[0].earnedCents - carryovers[0].carriedCents, 200000);
});

test('date-effective move happens before new earnings that day', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 100),
    entry('a', '10', 200, { date: '2026-07-01' })], [move()], season);
  assert.equal(rows.find(row => row.classId === '10').winningsCents, 300);
});

test('later moves carry previously transferred earnings without double counting', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 100)], [move(),
    move({ id: 'move-2', fromClassId: '10', toClassId: '9', date: '2026-08-01' })], season);
  assert.equal(rows.find(row => row.classId === '9').winningsCents, 100);
  assert.equal(rows.reduce((sum, row) => sum + row.winningsCents, 0), 100);
});

test('historical cutoffs exclude subsequent classification moves', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 100)], [move()], season, '2026-06-30');
  assert.equal(rows[0].classId, '11');
  assert.equal(rows[0].winningsCents, 100);
});

test('corrected official earnings replace previous totals on rebuild', () => {
  assert.equal(calculateSeasonStandings([entry('a', '11', 150)], [], season).rows[0].winningsCents, 150);
  assert.equal(calculateSeasonStandings([entry('a', '11', 125)], [], season).rows[0].winningsCents, 125);
});

test('attendance-only rules do not impose a placing requirement', () => {
  assert.equal(qualifiesForStandings({ rank: 50, ropingsEntered: 10 }, { topPlaces: null, minimumRopings: 10 }), true);
  assert.equal(qualifiesForStandings({ rank: 1, ropingsEntered: 9 }, { topPlaces: null, minimumRopings: 10 }), false);
});

test('qualification cutoff ignores later earnings and attendance', () => {
  const { rows } = calculateSeasonStandings([entry('a', '11', 100),
    entry('a', '11', 1000, { date: '2026-08-01', ropingId: 'roping-2' })], [], season, '2026-07-01');
  assert.equal(rows[0].ropingsEntered, 1);
  assert.equal(qualifiesForStandings(rows[0], { topPlaces: 5, minimumRopings: 2 }), false);
});

test('end-of-ladder earnings are retained and flagged rather than lost', () => {
  const { rows, carryovers } = calculateSeasonStandings([
    entry('a', '11', 200), entry('a', '10', 100), entry('a', '9', 50),
  ], [move()], season);
  assert.equal(rows.find(row => row.classId === '9').winningsCents, 150);
  assert.equal(rows.find(row => row.classId === '10').winningsCents, 200);
  const retained = carryovers.find(item => item.status === 'retained_at_end');
  assert.equal(retained.fromClassId, '9');
  assert.equal(retained.toClassId, '9');
  assert.equal(retained.carriedCents, 50);
  assert.equal(retained.earnedCents, 50);
});

test('a direct move from the last class does not create a retained review', () => {
  const { rows, carryovers } = calculateSeasonStandings([entry('a', '9', 50)],
    [move({ fromClassId: '9', toClassId: '10' })], season);
  assert.equal(rows.find(row => row.classId === '10').winningsCents, 50);
  assert.equal(carryovers.filter(item => item.status === 'retained_at_end').length, 0);
});

test('caps exclude only transferred money, not retained end-of-ladder earnings', () => {
  const { rows, carryovers } = calculateSeasonStandings([
    entry('a', '11', 200), entry('a', '9', 50), entry('leader', '10', 100),
  ], [move({ capAtLeader: true })], season);
  assert.equal(rows.find(row => row.roperId === 'a' && row.classId === '9').winningsCents, 50);
  assert.equal(carryovers.reduce((sum, item) => sum + item.earnedCents - item.carriedCents, 0), 100);
});
