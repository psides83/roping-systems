import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind, JsxEmit } from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { featureEnabled } from '../src/lib/producer-features.ts';
let features={};
const require=createRequire(import.meta.url);
function component(file) {
  const compiled={exports:{}};
  const source=transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,jsx:JsxEmit.ReactJSX}}).outputText;
  const imports=name=>name==='@/components/settings/producer-features-context'?{useProducerFeatures:()=>features}:name==='@/lib/producer-features'?{featureEnabled}:name==='next/navigation'?{useRouter:()=>({refresh(){}})}:name.includes('/migration/actions')?{}:name==='@/lib/history-import'?{}:require(name);
  new Function('require','module','exports',source)(imports,compiled,compiled.exports);
  return compiled.exports;
}
const {HistoryImportWorkspace}=component('../src/components/settings/history-import-workspace.tsx');
test('migration UI separates money, attendance, and fund opening balances with restricted treasurer access',()=>{
  const props={seasons:[{id:'s',name:'2026 season',starts_on:'2026-05-01',ends_on:'2027-04-30'}],classes:[],funds:[]};
  const manager=renderToStaticMarkup(React.createElement(HistoryImportWorkspace,{...props,canStandings:true}));
  for(const label of ['Historical winnings','Historical attendance','Opening fund balances','Choose spreadsheet','not payouts owed','earlier qualification cutoffs']) assert.ok(manager.includes(label));
  const treasurer=renderToStaticMarkup(React.createElement(HistoryImportWorkspace,{...props,canStandings:false}));
  assert.doesNotMatch(treasurer,/Historical winnings|Historical attendance/);
  assert.match(treasurer,/Opening fund balances/);
});
const {HistoryImportLog}=component('../src/components/settings/history-import-log.tsx');
test('migration hides unused features without removing attendance or existing fund access',()=>{
  features={standings:false,funds:false};
  try {
    const props={seasons:[],classes:[],funds:[],canStandings:true};
    const html=renderToStaticMarkup(React.createElement(HistoryImportWorkspace,props));
    assert.doesNotMatch(html,/Historical winnings|Opening fund balances/);
    assert.match(html,/Historical attendance/);
    const treasury=renderToStaticMarkup(React.createElement(HistoryImportWorkspace,{...props,canStandings:false}));
    assert.match(treasury,/Previous imports remain/);
    assert.doesNotMatch(treasury,/Choose spreadsheet/);
    const existing=renderToStaticMarkup(React.createElement(HistoryImportWorkspace,{...props,canStandings:false,funds:[{id:'fund',label:'General fund'}]}));
    assert.match(existing,/Opening fund balances/);
  } finally { features={}; }
});
test('import history preserves reversed records and does not offer unauthorized reversal',()=>{
  const batch={id:'b',kind:'standings',file_name:'Old <ledger>.csv',source_note:'Approved history',created_at:'2026-10-08',reversed_at:null,reversal_reason:null};
  const readonly=renderToStaticMarkup(React.createElement(HistoryImportLog,{batches:[batch],canStandings:false,canFunds:true}));
  assert.doesNotMatch(readonly,/Reverse import/);assert.match(readonly,/Old &lt;ledger&gt;/);
  const reversed=renderToStaticMarkup(React.createElement(HistoryImportLog,{batches:[{...batch,reversed_at:'2026-10-09',reversal_reason:'Wrong season'}],canStandings:true,canFunds:true}));
  assert.match(reversed,/Reversed/);assert.match(reversed,/Wrong season/);assert.doesNotMatch(reversed,/Reverse import/);
});
