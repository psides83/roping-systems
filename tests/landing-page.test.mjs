import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
test('landing page explains current benefits in plain language and preserves navigation and branding', () => {
  const compiled = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../src/components/marketing/landing-page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports = name => {
    if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name === 'next/image') return { default: props => {
      const imageProps = { ...props }; delete imageProps.fill; delete imageProps.priority;
      return React.createElement('img', imageProps);
    } };
    if (name === '@/components/ui/brand-logo') return { BrandLogo: () => React.createElement('span', null, 'Roping Systems') };
    return require(name);
  };
  new Function('require', 'module', 'exports', source)(imports, compiled, compiled.exports);
  const html = renderToStaticMarkup(React.createElement(compiled.exports.LandingPage));
  for (const phrase of ['waitlist', 'assigned arenas', 'record when they receive it', 'membership dues', 'Export standings', 'attendance still needed', 'participating producers', 'In-app notices', 'turn off optional tools']) assert.ok(html.includes(phrase), phrase);
  assert.match(html, /Separate prize money and fund contributions/);
  assert.match(html, /href="\/auth\/login"/);
  assert.match(html, /id="operations"/);
  assert.match(html, /id="live-results"/);
  assert.match(html, /id="producers"/);
  assert.doesNotMatch(html, /qualification_rule|RPC|ledger|guaranteed eligibility|offline access/);
});
