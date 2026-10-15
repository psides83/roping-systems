import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/components/reports/report-download.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(pending = false) {
 const exports = {}; let calls = 0; const changes = [];
 new Function('require', 'exports', source)(name => name === 'react' ? { useState: initial => { const index = calls++; return [index === 0 ? pending : initial, value => changes.push(value)]; } } : name === 'react/jsx-runtime' ? jsx : {}, exports);
 return { component: exports.ReportDownload, changes };
}
test('disabled or pending exports do not request another download', async () => {
 const original = globalThis.fetch; let requests = 0;
 globalThis.fetch = async () => { requests++; };
 try {
  for (const pending of [false, true]) {
   const { component } = load(pending);
   const tree = component({ href: '/api/reports?report=funds', disabled: !pending });
   await tree.props.children[0].props.onClick();
  }
  assert.equal(requests, 0);
 } finally { globalThis.fetch = original; }
});
test('export uses applied URL and rejects non-CSV responses with recoverable feedback', async () => {
 const original = globalThis.fetch; let requested;
 globalThis.fetch = async (href, options) => { requested = { href, options }; return { ok: true, headers: new Headers({ 'Content-Type': 'text/html' }) }; };
 try {
  const { component, changes } = load();
  await component({ href: '/api/reports?report=payouts&season=s' }).props.children[0].props.onClick();
  assert.deepEqual(requested, { href: '/api/reports?report=payouts&season=s', options: { cache: 'no-store' } });
  assert.ok(changes.some(value => typeof value === 'string' && value.includes('Refresh and try again')));
  assert.equal(changes.at(-1), false);
 } finally { globalThis.fetch = original; }
});
