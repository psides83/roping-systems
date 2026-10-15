import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const exports = {};
const source = ts.transpileModule(fs.readFileSync(new URL('../src/components/reports/report-scope.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
new Function('require', 'exports', source)(() => jsx, exports);
const season = { starts_on: '2026-01-01', ends_on: '2026-12-31' };
const render = (filters, extra = {}) => renderToStaticMarkup(jsx.jsx(exports.ReportScope, { filters, season, ...extra }));
test('standings shows its default season-end cutoff', () => {
 const html = render({ report: 'standings', season: 's' });
 assert.match(html, /Standings through/); assert.match(html, /2026-12-31/); assert.doesNotMatch(html, /No end cutoff|All events/);
});
test('financial scope displays effective dates clamped to the selected season', () => {
 const html = render({ report: 'payouts', season: 's', from: '2025-01-01', through: '2027-01-01', status: 'partial' });
 assert.match(html, /2026-01-01/); assert.match(html, /2026-12-31/); assert.match(html, /Event dates from/); assert.match(html, /Partially paid/); assert.doesNotMatch(html, /2025-01-01|2027-01-01/);
});
test('fund scope includes fund and escapes search text', () => {
 const html = render({ report: 'funds', fund: 'f', search: '<sample>' }, { labels: { fund: 'Finals fund' } });
 assert.match(html, /Finals fund/); assert.match(html, /&lt;sample&gt;/); assert.doesNotMatch(html, /Classification/); assert.match(html, /all matching rows/);
});
test('all-season reports preserve explicit custom cutoffs', () => {
 const html = render({ report: 'collections', from: '2025-01-01' }, { season: undefined });
 assert.match(html, /2025-01-01/); assert.match(html, /No end cutoff/); assert.match(html, /All seasons/);
});
