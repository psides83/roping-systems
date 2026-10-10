import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind, JsxEmit } from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { featureEnabled } from '../src/lib/producer-features.ts';
const require = createRequire(import.meta.url);
function component(path, mocks) {
  const compiled = {exports:{}};
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ModuleKind.CommonJS,jsx:JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',source)(name=>mocks[name] ?? require(name),compiled,compiled.exports);
  return compiled.exports;
}
test('feature gate preserves existing obligations while hiding unused controls',()=>{
  const {ProducerFeatureGate} = component('../src/components/settings/producer-features-context.tsx', {
    react:{...React,useContext:()=>({funds:false})},
    '@/lib/producer-features':{featureEnabled},
  });
  const render=preserve=>renderToStaticMarkup(React.createElement(ProducerFeatureGate,{feature:'funds',preserve},'Existing fund'));
  assert.equal(render(false),'');
  assert.equal(render(true),'Existing fund');
});
function recordsDb(records) {
  const query={select:()=>query,eq:()=>query,order:async()=>({data:records,error:null})};
  return {from:()=>query,rpc:async()=>({data:[{today:'2026-10-10'}],error:null})};
}
test('disabled empty fine panels disappear, existing fines retain settlement access',async()=>{
  let records=[];
  const {MemberFinesData}=component('../src/components/members/member-fines-data.tsx',{
    '@/lib/supabase/server':{createClient:async()=>recordsDb(records)},
    './member-fines':{MemberFines:()=>null},
  });
  assert.equal(await MemberFinesData({membershipId:'member',canManage:false,enabled:false}),null);
  records=[{id:'fine',amount_cents:5000,reason:'Rule violation',restriction:'none',issued_at:'2026-10-01',issued_by_label:'Staff',member_fine_transactions:[],member_fine_exceptions:[]}];
  const panel=await MemberFinesData({membershipId:'member',canManage:false,enabled:false});
  assert.equal(panel.props.allowIssue,false);
  assert.equal(panel.props.fines.length,1);
});
test('disabled empty suspension panels disappear without hiding existing suspensions',async()=>{
  let records=[];
  const {MemberSuspensionsData}=component('../src/components/members/member-suspensions-data.tsx',{
    '@/lib/supabase/server':{createClient:async()=>recordsDb(records)},
    './member-suspensions':{MemberSuspensions:()=>null},
  });
  assert.equal(await MemberSuspensionsData({membershipId:'member',canManage:true,enabled:false}),null);
  records=[{id:'suspension',starts_on:'2026-10-01',ends_on:'2026-10-20',reason:'Violation'}];
  const panel=await MemberSuspensionsData({membershipId:'member',canManage:true,enabled:false});
  assert.equal(panel.props.allowIssue,false);
  assert.equal(panel.props.canManage,true);
  assert.equal(panel.props.suspensions.length,1);
});
