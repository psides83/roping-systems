import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const compiled = { exports: {} };
const source = ts.transpileModule(readFileSync(new URL('../src/components/ui/brand-logo.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function('require', 'module', 'exports', source)(name => name === 'next/image'
  ? { default: props => React.createElement('img', props) } : require(name), compiled, compiled.exports);
test('all logo sizes use the same rounded frame and padding with stable artwork proportions', () => {
  for (const className of ['w-32', 'w-40', 'w-[360px]']) {
    const html = renderToStaticMarkup(React.createElement(compiled.exports.BrandLogo, { className }));
    assert.match(html, /rounded-lg/);
    assert.match(html, /p-2/);
    assert.match(html, /aspect-\[1\.65\]/);
    assert.match(html, /alt="Roping Systems"/);
    assert.match(html, /roping-systems-branding.png/);
  }
  const decorative = renderToStaticMarkup(React.createElement(compiled.exports.BrandLogo, { decorative: true }));
  assert.match(decorative, /alt=""/);
});
