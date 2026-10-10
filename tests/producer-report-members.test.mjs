import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as reports from '../src/lib/producer-reports.ts';

function load(file, mocks) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', source)(name => {
    if (name === 'server-only') return {};
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  }, exports);
  return exports;
}
const options = { producer: { id: 'producer', slug: 'producer', name: 'Producer', timezone: 'America/Chicago' },
  seasons: [{ id: 'season', name: '2026', starts_on: '2026-01-01', ends_on: '2026-12-31' }],
  events: [{ id: 'event', title: 'Event', starts_at: '2026-10-01', ends_at: null }], funds: [] };

test('standings and attendance use producer member numbers, not internal IDs', async () => {
  const source = { contributions: [], moves: [], classes: [{ id: 'class-id', name: '#11', divisionName: 'Tie-down' }],
    ropers: [{ roperId: 'roper-id', classId: 'class-id', name: 'Jane Smith', city: 'Hamilton', state: 'TX' }] };
  const scopes = [];
  const query = { select: () => query, eq: (key, value) => { scopes.push([key, value]); return query; }, order: () => query,
    range: async () => ({ data: [{ roper_id: 'roper-id', member_number: '00123' }], error: null }) };
  const db = { from: table => { assert.equal(table, 'memberships'); return query; }, rpc: async () => ({ data: source, error: null }) };
  const { loadProducerReport } = load('../src/lib/producer-report-data.ts', {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/read-all-rows': { readAllRows: async fn => (await fn(0, 499)).data },
    '@/lib/events/season-standings-data': { loadSeasonStandings: async () => source },
    '@/lib/season-standings': { calculateSeasonStandings: () => ({ rows: [{ roperId: 'roper-id', classId: 'class-id', rank: 1, winningsCents: 12300, ropingsEntered: 3 }] }) },
    '@/lib/producer-reports': reports,
    '@/lib/producer-report-options': { loadReportOptions: async () => options, validateReportSelection: () => {} },
    '@/lib/producer-financial-reports': {},
  });
  for (const type of ['standings', 'attendance']) {
    const { report } = await loadProducerReport({ report: type, season: 'season' });
    assert.equal(report.rows[0][report.columns.indexOf('Member number')], '00123');
    assert.equal(report.rows[0].length, report.columns.length);
    assert.ok(!report.columns.includes('Roper ID') && !report.columns.includes('Classification ID'));
    assert.ok(!report.rows[0].includes('roper-id') && !report.rows[0].includes('class-id'));
    assert.match(reports.reportCsv(report), /"00123"/);
  }
  assert.deepEqual(scopes, [['producer_id', 'producer'], ['producer_id', 'producer']]);
});

test('payout reports retain member numbers and align award columns after removing roper ID', async () => {
  const award = { roping_name: '#11 Tie-down', contestant_name: 'Jane Smith', member_number: '00123', pool_name: 'Main', pool_type: 'main',
    section_type: 'aggregate', round_number: null, d_number: null, place_number: 1, payout_cents: 10000, paid_cents: 0,
    event_roping_id: 'roping-id', roper_id: 'roper-id', entry_id: 'entry-id', plan_id: 'plan-id', award_key: 'award-key' };
  const { loadFinancialReport } = load('../src/lib/producer-financial-reports.ts', {
    '@/lib/supabase/server': { createClient: async () => ({}) },
    '@/lib/supabase/read-all-rows': { readAllRows: async () => [award] },
    '@/lib/producer-reports': reports,
    '@/lib/events/public-money-results': { compareMoneyPools: () => 0 },
  });
  const report = await loadFinancialReport(options, { report: 'payouts', status: 'all' });
  assert.equal(report.rows[0][report.columns.indexOf('Member number')], '00123');
  assert.equal(report.rows[0][report.columns.indexOf('Entry ID')], 'entry-id');
  assert.equal(report.rows[0].length, report.columns.length);
  assert.ok(!report.columns.includes('Roper ID') && !report.rows[0].includes('roper-id'));
});
