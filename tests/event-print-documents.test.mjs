import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiled = { exports: {} };
  const localRequire = name => {
    const paths = {
      '../entry-labels': 'lib/entry-labels.ts', '../entry-balance': 'lib/entry-balance.ts',
      './print-documents': 'lib/events/print-documents.ts', '@/lib/utils': 'lib/utils.ts',
      '@/lib/run-status': 'lib/run-status.ts', '@/lib/events/print-documents': 'lib/events/print-documents.ts',
      '@/lib/events/payout-register': 'lib/events/payout-register.ts',
    };
    return paths[name] ? load(paths[name]) : require(name);
  };
  new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports);
  cache.set(path, compiled.exports);
  return compiled.exports;
}
const helpers = load('lib/events/print-documents.ts');
const data = load('lib/events/print-document-data.ts');
const sheets = load('components/events/print-document-sheet.tsx');
const run = overrides => ({ id: 'run', round: 1, position: 1, name: 'Morgan Reed', entryNumber: 2, cattle: '104', readings: [], raw: null, penalty: 0, adjustment: 0, status: 'pending', attempts: 0, ...overrides });
const roping = { id: 'roping', name: '#11.5 Tie-down', scheduled_date: '2026-10-09', arena_name: 'Arena 1', main_round_count: 3, short_round_enabled: true, timer_count: 3, timer_resolution: 'average' };
const award = overrides => ({ planId: 'plan', ropingId: 'roping', ropingName: '#11.5 Tie-down', poolName: 'Main', poolType: 'main', entryId: 'entry', roperId: 'person', name: 'Morgan Reed', memberNumber: '144', sectionType: 'aggregate', round: null, dNumber: null, place: 1, awardKey: 'award', amountCents: 12345, paidCents: 2345, ...overrides });

test('document permissions separate timing, entry finances, and payout finances', () => {
  const none = { manage: false, time: false, collect: false, finance: false };
  assert.deepEqual(helpers.printKinds(none), []);
  assert.deepEqual(helpers.printKinds({ ...none, time: true }), ['draw', 'timer']);
  assert.deepEqual(helpers.printKinds({ ...none, collect: true }), ['draw', 'timer', 'entries']);
  assert.deepEqual(helpers.printKinds({ ...none, finance: true }), ['payouts']);
});
test('draw sorting puts unassigned positions last without changing input', () => {
  const rows = [run({ id: 'a', position: null }), run({ id: 'b', position: 2 }), run({ id: 'c', position: 1 })];
  assert.deepEqual(helpers.sortPrintRuns(rows).map(r => r.id), ['c', 'b', 'a']);
  assert.equal(rows[0].id, 'a');
});
test('entry labels, signed handicap scoring, rounding, and invalid rounds', () => {
  assert.equal(helpers.printEntry(2, 'letter'), 'B');
  assert.equal(helpers.printEntry(2, 'number'), '#2');
  assert.equal(helpers.printTime(run({ status: 'complete', raw: 10.126, penalty: 5, adjustment: -.25 })), '15.38');
  assert.equal(helpers.printTime(run({ status: 'no_time', raw: 10 })), null);
  assert.equal(helpers.printRound('4', roping), 4);
  for (const value of ['0', '-1', '5', '1.5', 'bad']) assert.equal(helpers.printRound(value, roping), 1);
});
test('large documents fetch every page and surface database errors', async () => {
  const rows = Array.from({ length: 1201 }, (_, i) => i);
  const calls = [];
  assert.deepEqual(await data.allPrintRows((from, to) => { calls.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); }), rows);
  assert.equal(calls.length, 3);
  await assert.rejects(data.allPrintRows(() => Promise.resolve({ data: null, error: { message: 'Denied' } })), /Denied/);
});
test('roping document groups every configured round, including an unbuilt short round', () => {
  const rows = [run({ id: 'second', round: 2, position: 2 }), run({ id: 'first', round: 2, position: 1 }), run({ id: 'r1' }), run({ id: 'r3', round: 3, position: null })];
  const rounds = helpers.printRoundSheets(roping, rows);
  assert.deepEqual(rounds.map(sheet => sheet.round), [1, 2, 3, 4]);
  assert.deepEqual(rounds[1].runs.map(row => row.id), ['first', 'second']);
  assert.deepEqual(rounds.map(sheet => sheet.ready), [true, true, false, false]);
  assert.deepEqual(rounds[3].runs, []);
  assert.equal(rows[0].id, 'second');
  assert.equal(helpers.printRoundSheets({ ...roping, short_round_enabled: false }, rows).length, 3);
});
test('all-round loader scopes reads and retains round numbers across pagination', async () => {
  const calls = [];
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i), round_number: i < 300 ? 1 : 2, draw_position: i + 1, raw_time_seconds: null, penalty_seconds: 0, status: 'pending', rerun_count: 0, event_cattle: null, run_timer_readings: [], roping_entries: { entry_number: 1, competition_status: i === 500 ? 'moved' : 'active', handicap_time_credit_seconds: 0, ropers: { first_name: 'Morgan', last_name: 'Reed' } } }));
  const db = { from(table) {
    assert.equal(table, 'competition_runs');
    let start = 0, end = 499;
    return { select() { return this; }, eq(field, value) { calls.push([field, value]); return this; }, order() { return this; }, range(a, b) { start = a; end = b; calls.push(['range', a]); return this; }, then(resolve) { return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve); } };
  } };
  const result = await data.loadPrintRuns(db, 'producer', 'roping');
  assert.equal(result.length, 500);
  assert.equal(result.filter(row => row.round === 2).length, 200);
  assert.ok(calls.some(([field, value]) => field === 'producer_id' && value === 'producer'));
  assert.ok(calls.some(([field, value]) => field === 'event_roping_id' && value === 'roping'));
  assert.ok(calls.some(([field, value]) => field === 'range' && value === 500));
  assert.ok(!calls.some(([field]) => field === 'round_number'));
  await data.loadPrintRuns(db, 'producer', 'roping', 2);
  assert.ok(calls.some(([field, value]) => field === 'round_number' && value === 2));
});
test('one document renders every round heading and warns about incomplete orders', () => {
  const rounds = helpers.printRoundSheets(roping, [run(), run({ id: 'r2', round: 2, position: null })]);
  const html = renderToStaticMarkup(React.createElement('article', null, rounds.map(sheet => React.createElement('section', { key: sheet.round, className: 'round-sheet' }, React.createElement(sheets.RunSheet, { roping, round: sheet.round, runs: sheet.runs, timer: true, style: 'number' })))));
  for (const heading of ['Round 1', 'Round 2', 'Round 3', 'Short round', 'Provisional round']) assert.ok(html.includes(heading));
  assert.equal((html.match(/class="round-sheet"/g) ?? []).length, 4);
});
test('timer worksheet renders all timers, saved readings, NT, and reruns', () => {
  const html = renderToStaticMarkup(React.createElement(sheets.RunSheet, { roping, round: 4, timer: true, style: 'letter', runs: [run({ readings: [{ timer: 2, seconds: 12.45 }], attempts: 1 }), run({ id: 'nt', status: 'no_time' })] }));
  for (const text of ['Short round', 'Timer 3', '12.45', 'No time', 'Rerun attempt 2', '>B<']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('onClick'));
});
test('payout sheets preserve cents and recorded confirmation, never request a signature', () => {
  const html = renderToStaticMarkup(React.createElement(sheets.PayoutAcknowledgmentSheet, { awards: [award()], acknowledgments: [{ id: 'receipt', roperId: 'person', recipient: 'Morgan Reed', confirmed: true, staff: 'Sam', date: 'Oct 9' }] }));
  for (const text of ['$123.45', '$23.45', '$100.00', 'Receipt confirmed', 'Received by', 'does not mark payouts paid']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Signature'));
});
test('entry summaries include itemization, event-wide fees, and credit without private contact details', () => {
  const html = renderToStaticMarkup(React.createElement(sheets.EntrySummarySheets, { summaries: [{ id: 'person', name: 'Morgan Reed', entries: [{ id: 'entry', roping: '#11.5 Tie-down', label: 'A', status: 'active', payment: 'paid_cash' }], charges: [{ id: 'fee', title: 'Office charge', entryLabel: 'Event-wide', amount: 2000, waived: false }], due: 2000, paid: 2500, balance: 0, credit: 500 }] }));
  for (const text of ['Office charge', 'Event-wide', '$25.00', 'Credit: $5.00']) assert.ok(html.includes(text), text);
});

export function printPreviewHtml() {
  const rows = Array.from({ length: 65 }, (_, i) => run({ id: String(i), position: i + 1, name: `Morgan Reed ${i + 1}`, entryNumber: i % 3 + 1 }));
  return renderToStaticMarkup(React.createElement('article', { className: 'event-print-document timer-document print-active-document' },
    React.createElement('header', null, React.createElement('h1', null, 'Arena Weekend'), React.createElement('p', null, 'Ultimate Calf Roping · Timer sheet')),
    ...helpers.printRoundSheets(roping, rows).map(sheet => React.createElement('section', { key: sheet.round, className: 'round-sheet' }, React.createElement(sheets.RunSheet, { roping, round: sheet.round, timer: true, style: 'letter', runs: sheet.runs })))));
}
