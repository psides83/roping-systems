import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualificationNoticeText } from '../src/lib/events/qualification-notice.ts';

const notice = { event_roping_id: 'roping', season_name: '2026', top_places: 10,
  minimum_ropings: 5, cutoff_on: '2026-10-01', requirements_available: true };
test('qualification notice includes placing, attendance, season and cutoff', () => {
  assert.equal(qualificationNoticeText(notice), '2026 qualification · Top 10, including ties · 5 ropings required · Through 2026-10-01');
});
test('attendance-only qualification does not invent a placing limit', () => {
  const text = qualificationNoticeText({ ...notice, top_places: null, cutoff_on: null });
  assert.ok(!text.includes('Top'));
  assert.ok(text.includes('Live standings'));
});
test('missing or mismatched rules never advertise stale requirements', () => {
  const text = qualificationNoticeText({ ...notice, requirements_available: false });
  assert.ok(text.includes('Contact the producer'));
  assert.ok(!text.includes('Top 10'));
});
test('alternative qualification paths clearly say OR instead of implying both are required', () => {
  assert.match(qualificationNoticeText({ ...notice, requirement_match: 'any' }), /Top 10 OR 5 ropings attended/);
});
