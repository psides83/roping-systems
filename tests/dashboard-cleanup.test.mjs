import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupChecklistSummary } from '../src/lib/producer-setup.ts';
import { featureEnabled } from '../src/lib/producer-features.ts';

function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', code)(name => name === 'react/jsx-runtime' ? jsx : name === 'next/link' ? { default: 'a' } : mocks[name] ?? { ArrowRight: () => null, ClipboardList: () => null, Clock3: () => null }, exports);
  return exports;
}
const { DashboardSetupChecklist } = load('../src/components/dashboard/dashboard-setup.tsx', {
  '@/lib/producer-setup': { setupChecklistSummary },
  '@/components/settings/producer-setup-checklist': { ProducerSetupChecklist: () => jsx.jsx('div', { children: 'Full checklist' }) },
});
const item = status => ({ id: status, title: status === 'attention' ? 'Roping templates' : status, status, href: '/settings/roping-templates', group: 'competition', detail: '', issues: [] });
const renderSetup = items => renderToStaticMarkup(jsx.jsx(DashboardSetupChecklist, { items }));
test('dashboard setup disappears when required checks are ready, even with unused optional features', () => {
  assert.equal(renderSetup([item('ready'), item('optional')]), '');
  assert.equal(renderSetup([]), '');
});
test('incomplete dashboard setup offers the next step and expandable checklist', () => {
  const html = renderSetup([item('ready'), item('attention'), item('optional')]);
  assert.match(html, /1 of 2 setup checks ready/);
  assert.match(html, /Next step: Roping templates/);
  assert.match(html, /<details/);
  assert.match(html, /Full checklist/);
});
function renderAttention(pendingMembers, unpaidEvents, requireMemberships = true) {
  const { DashboardAttention } = load('../src/components/dashboard/dashboard-attention.tsx', {
    '@/components/settings/producer-features-context': { useProducerFeatures: () => ({ require_memberships: requireMemberships }) },
    '@/lib/producer-features': { featureEnabled },
  });
  return renderToStaticMarkup(jsx.jsx(DashboardAttention, { pendingMembers, unpaidEvents }));
}
test('attention stays hidden with no actionable work, including disabled membership approvals', () => {
  assert.equal(renderAttention(0, []), '');
  assert.equal(renderAttention(5, [], false), '');
});
test('attention links directly to pending reviews and event payments without a setup detour', () => {
  const html = renderAttention(2, [{ id: 'event-one', title: 'Fall Classic', count: 3 }]);
  assert.match(html, /members\?status=pending/);
  assert.match(html, /events\/event-one\/entries\?payment=unpaid#entry-ledger/);
  assert.doesNotMatch(html, /setup checklist|No pending approvals/);
  assert.doesNotMatch(renderAttention(2, [{ id: 'event-one', title: 'Fall Classic', count: 3 }], false), /membership/);
});
