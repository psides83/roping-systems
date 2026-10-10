import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as eligibility from '../src/lib/finals-entry-eligibility.ts';
import * as standings from '../src/lib/season-standings.ts';
const require = createRequire(import.meta.url);
function compile(path, mocks = {}) {
  const compiled = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), compiled, compiled.exports);
  return compiled.exports;
}
const outlook = compile('../src/lib/finals-outlook.ts', { './finals-entry-eligibility': eligibility });
const rule = { topPlaces: 10, minimumRopings: 10, earnedPositionPolicy: 'none', requirementMatch: 'all', standingsCutoff: '2026-10-10', attendanceCutoff: '2026-10-20' };
const project = (row, overrides = {}, ...args) => outlook.projectFinalsOutlook(row, { ...rule, ...overrides }, '2026-10-10', 1, true, ...args);

test('cutoffs include the cutoff day and show separate approaching deadlines', () => {
  assert.equal(outlook.outlookDeadline('2026-10-10', '2026-10-10').closed, false);
  assert.equal(outlook.outlookDeadline('2026-10-10', '2026-10-10').label, 'Closes today');
  assert.equal(outlook.outlookDeadline('2026-10-09', '2026-10-10').closed, true);
  const row = project({ rank: 11, ropingsEntered: 8 });
  assert.equal(row.status, 'both');
  assert.equal(row.remainingRopings, 2);
  assert.equal(row.attendanceDeadline.label, '10 days left');
  assert.equal(row.standingsDeadline.label, 'Closes today');
});
test('ties and either-requirement policies agree with entry eligibility', () => {
  assert.equal(project({ rank: 10, ropingsEntered: 10 }).qualified, true);
  assert.equal(project({ rank: 10, ropingsEntered: 2 }, { requirementMatch: 'any' }).qualified, true);
  assert.equal(project({ rank: 15, ropingsEntered: 10 }, { requirementMatch: 'any' }).qualified, true);
  assert.equal(project(undefined, { topPlaces: null, minimumRopings: 0 }).qualified, true);
  assert.equal(project(undefined, { topPlaces: null, minimumRopings: 0, requirementMatch: undefined }).qualified, false);
});
test('only assigned bonus positions affect requirements and entry allowance', () => {
  const pending = project({ rank: 15, ropingsEntered: 2 }, { earnedPositionPolicy: 'rank_and_attendance' }, 3);
  assert.equal(pending.qualified, false);
  assert.equal(pending.allowance, 1);
  assert.equal(pending.pendingPositions, 3);
  const assigned = { rank: 15, ropingsEntered: 2, finalsPositions: 2 };
  assert.equal(project(assigned, { earnedPositionPolicy: 'rank' }).status, 'attendance');
  assert.equal(project(assigned, { earnedPositionPolicy: 'rank_and_attendance' }).qualified, true);
  assert.equal(project(assigned).allowance, 3);
  assert.equal(outlook.projectFinalsOutlook(assigned, rule, '2026-10-10', 1, false).allowance, 1);
  assert.equal(outlook.projectFinalsOutlook(assigned, rule, '2026-10-10', null, true).allowance, null);
});
test('restrictions require producer review even when standings requirements are met', () => {
  const row = project({ rank: 1, ropingsEntered: 12 }, {}, 0, ['A suspension affects this roping.']);
  assert.equal(row.qualified, true);
  assert.equal(row.status, 'review');
  assert.match(row.reasons[0], /suspension/);
  assert.equal(outlook.projectFinalsOutlook(undefined, null, '2026-10-10', 1, true).status, 'review');
});

function loaderFixture({ targets, slots = [], error = null } = {}) {
  const target = { id: 'finals', eventId: 'event', eventTitle: 'Fall Finals', eventSlug: 'finals', name: '#11', divisionName: 'Tie-down', date: '2026-11-01', classKey: '11', normalEntries: 1, bonusEnabled: true, requirementsAvailable: true, classificationAllowed: true, restrictions: [], rule: { ...rule, standingsCutoff: '2026-10-01', minimumRopings: 2, topPlaces: 1 } };
  const context = { today: '2026-10-10', producerSlug: 'test', roperId: 'me', currentClasses: ['11'], season: { id: 'season', name: 'Season', startsOn: '2026-01-01', endsOn: '2026-12-31' }, seasons: [], targets: targets ?? [target] };
  const calls = [];
  const bonus = { source: { finishes: [{ date: '2026-10-01' }, { date: '2026-10-02' }], manual: [], moves: [], decisions: [] } };
  const source = { moves: [], contributions: [
    { roperId: 'other', classId: '11', ropingId: 'first', date: '2026-10-01', official: true, winningsCents: 200 },
    { roperId: 'me', classId: '11', ropingId: 'first', date: '2026-10-01', official: true, winningsCents: 100 },
    { roperId: 'me', classId: '11', ropingId: 'second', date: '2026-10-05', official: true, winningsCents: 1000 },
    { roperId: 'me', classId: '11', ropingId: 'future', date: '2026-10-15', official: true, winningsCents: 2000 },
  ] };
  const loader = compile('../src/lib/events/finals-outlook-data.ts', {
    'server-only': {}, '@/lib/supabase/server': { createClient: async () => ({ rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: name === 'my_roper_finals_outlook_context' ? context : bonus, error };
    } }) },
    '@/lib/events/season-standings-data': { loadSeasonStandings: async () => source },
    '@/lib/season-standings': standings, '@/lib/finals-outlook': outlook,
    '@/lib/events/roping-display-name': { ropingDisplayName: (name, division) => `${name} ${division}` },
    '@/lib/roper-bonus-positions': { roperBonusPositions: data => {
      assert.deepEqual(data.source.finishes.map(row => row.date), ['2026-10-01']);
      return slots;
    } },
  });
  return { loader, context, calls, target };
}
test('loader ranks the whole class and uses separate cutoffs capped at today', async () => {
  const { loader, calls } = loaderFixture();
  const result = await loader.loadRoperFinalsOutlook('member', 'season');
  assert.equal(result.rows[0].progress.rank, 2);
  assert.equal(result.rows[0].progress.attendance, 2);
  assert.equal(result.rows[0].progress.status, 'standings');
  assert.deepEqual(calls.map(call => call.name), ['my_roper_finals_outlook_context', 'my_roper_bonus_positions']);
  assert.equal(calls[0].params.target_membership_id, 'member');
});
test('loader separates pending, assigned elsewhere, expired and review positions', async () => {
  const { loader } = loaderFixture({ slots: [
    { classId: '11', status: 'assigned', targetId: 'finals' },
    { classId: '11', status: 'assigned', targetId: 'another' },
    { classId: '11', status: 'pending' }, { classId: '11', status: 'expired' },
    { classId: 'old', status: 'needs_review', targetId: 'finals' },
  ] });
  const result = await loader.loadRoperFinalsOutlook('member');
  assert.equal(result.rows[0].progress.assigned, 1);
  assert.equal(result.rows[0].progress.pendingPositions, 1);
  assert.equal(result.rows[0].progress.allowance, 2);
  assert.equal(result.rows[0].progress.status, 'review');
});
test('loader stops on ownership errors and does not fetch unnecessary data for empty outlooks', async () => {
  const denied = loaderFixture({ error: { message: 'not linked' } });
  await assert.rejects(denied.loader.loadRoperFinalsOutlook('foreign'), /Unable to load/);
  assert.equal(denied.calls.length, 1);
  const empty = loaderFixture({ targets: [] });
  assert.deepEqual((await empty.loader.loadRoperFinalsOutlook('member')).rows, []);
  assert.equal(empty.calls.length, 1);
});

test('portal explains projections, separate cutoffs, pending positions and allowance without approving entry', () => {
  const { PortalFinalsOutlook } = compile('../src/components/roper/portal-finals-outlook.tsx', {
    '@/lib/finals-outlook': outlook,
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  });
  const { context, target } = loaderFixture();
  const progress = project({ rank: 3, ropingsEntered: 8, finalsPositions: 2 }, {}, 1);
  const html = renderToStaticMarkup(React.createElement(PortalFinalsOutlook, { data: { context, rows: [{ target: { ...target, rule }, progress }] } }));
  assert.match(html, /not an approved entry/);
  assert.match(html, /1 pending position needs producer assignment/);
  assert.match(html, /3 entries/);
  assert.match(html, /Standings through/);
  assert.match(html, /Attendance through/);
  assert.match(html, /Cutoff dates include that day/);
  assert.match(html, /\/public\/test\/schedule\?event=finals/);
  const empty = renderToStaticMarkup(React.createElement(PortalFinalsOutlook, { data: { context, rows: [] } }));
  assert.match(empty, /No upcoming qualification-required ropings/);
});

test('staff preview starts collapsed and offers functioning name and status filtering', () => {
  let state = ['', 'all'];
  const { StaffOutlookTable } = compile('../src/components/events/staff-outlook-table.tsx', {
    '@/lib/finals-outlook': outlook, react: { ...React, useState: () => [state.shift(), () => {}] },
  });
  const props = { rows: [
    { id: '1', name: 'Alex Miller', progress: project({ rank: 1, ropingsEntered: 10 }) },
    { id: '2', name: 'Casey Baker', progress: project({ rank: 15, ropingsEntered: 2 }) },
  ], today: '2026-10-10', minimumRopings: 10, topPlaces: 10, standingsCutoff: rule.standingsCutoff, attendanceCutoff: rule.attendanceCutoff };
  const render = () => renderToStaticMarkup(React.createElement(StaffOutlookTable, props));
  const html = render();
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /Read-only preview/);
  assert.match(html, /1 currently meet/);
  state = ['Casey', 'attendance'];
  const filtered = render();
  assert.match(filtered, /Casey Baker/);
  assert.doesNotMatch(filtered, /Alex Miller/);
  state = ['Alex', 'standings'];
  assert.match(render(), /No ropers match this view/);
});
