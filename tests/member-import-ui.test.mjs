import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind, JsxEmit } from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importFields } from '../src/lib/member-import.ts';

const require = createRequire(import.meta.url);
const compiled = { exports: {} };
const source = transpileModule(readFileSync(new URL('../src/components/members/import-preview.tsx',import.meta.url),'utf8'), { compilerOptions: { module:ModuleKind.CommonJS,jsx:JsxEmit.ReactJSX } }).outputText;
new Function('require','module','exports',source)((name) => name === '@/lib/member-import' ? { importFields } : require(name),compiled,compiled.exports);

test('preview makes update approvals explicit and shows readable classifications', () => {
  const division = {id:'division',name:'Breakaway',classifications:[{id:'class',name:'A'}]};
  const html = renderToStaticMarkup(React.createElement(compiled.exports.ImportPreviewTable, {
    rows:[{row:2,member:{memberNumber:'001',firstName:'Jo',lastName:'Smith',classifications:[{divisionId:'division',classificationId:'class'}]},errors:[],operation:'update',before:{classifications:[]}}],
    divisions:[division],selected:new Set(),toggle:()=>{},outcomes:{},
  }));
  assert.match(html,/Approve update/);
  assert.match(html,/Breakaway: A/);
  assert.doesNotMatch(html,/checked=""/);
});
test('invalid and already imported rows cannot be approved', () => {
  const html=renderToStaticMarkup(React.createElement(compiled.exports.ImportPreviewTable, {
    rows:[{row:2,member:{firstName:'Jo'},errors:['Missing member number']}],divisions:[],selected:new Set(),toggle:()=>{},outcomes:{},
  }));
  assert.match(html,/disabled=""/);
  assert.match(html,/Missing member number/);
});
