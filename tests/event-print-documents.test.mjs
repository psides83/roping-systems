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
const run = overrides => ({ id: 'run', position: 1, name: 'Morgan Reed', entryNumber: 2, cattle: '104', readings: [], raw: null, penalty: 0, adjustment: 0, status: 'pending', attempts: 0, ...overrides });
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
    React.createElement(sheets.RunSheet, { roping, round: 1, timer: true, style: 'letter', runs: rows })));
}
