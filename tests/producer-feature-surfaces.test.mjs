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
function dialogMocks(features) {
  let stateIndex=0;
  return {
    reset:()=>{stateIndex=0;},
    mocks:{
      react:{...React,useEffect:()=>{},useRef:()=>({current:null}),useMemo:fn=>fn(),useActionState:()=>[{},()=>{},false],useState:initial=>[stateIndex++===0?true:typeof initial==='function'?initial():initial,()=>{}]},
      '@/components/settings/producer-features-context':{useProducerFeatures:()=>features},
      '@/lib/producer-features':{featureEnabled},
      '@/app/(app)/settings/roping-templates/actions':{},
      '@/app/(app)/settings/payouts/actions':{},
      '@/components/settings/delete-record-button':{DeleteRecordButton:()=>null},
      '@/components/events/short-round-settings':{ShortRoundFields:()=>React.createElement('span',null,'Short round settings')},
      '@/components/settings/four-d-settings-fields':{FourDSettingsFields:()=>React.createElement('span',null,'4D settings')},
      '@/components/ui/number-stepper':{NumberStepper:({label,...props})=>React.createElement('input',{'aria-label':label,...props})},
    },
  };
}
test('new templates hide disabled formats and rounds; existing formats remain editable',()=>{
  const {mocks,reset}=dialogMocks({handicap:false,four_d:false,short_rounds:false,cattle_draw:false});
  const {CreateDivisionDialog,EditDivisionDialog}=component('../src/components/settings/division-dialogs.tsx',mocks);
  const props={configured:true,divisions:[{id:'td',name:'Tie-down'}],payoutSchedules:[],classifications:[]};
  const render=(Component,extra={})=>{reset();return renderToStaticMarkup(React.createElement(Component,{...props,...extra}));};
  const fresh=render(CreateDivisionDialog);
  assert.doesNotMatch(fresh,/value="handicap"|value="four_d"|Short round settings|Draw and track cattle/);
  assert.match(fresh,/name="shortRoundBrackets"/);
  const existing=render(EditDivisionDialog,{template:{id:'template',name:'Handicap',disciplineId:'td',competitionFormat:'handicap',shortRoundEnabled:true,cattleDrawEnabled:true}});
  assert.match(existing,/value="handicap"/);
  assert.match(existing,/Short round settings/);
  assert.match(existing,/Draw and track cattle/);
});
test('new template fees hide disabled pots without removing an existing pot choice',()=>{
  const {mocks,reset}=dialogMocks({side_pots:false,insurance:false,funds:false});
  const {AddFeeDialog,EditFeeDialog}=component('../src/components/settings/division-dialogs.tsx',mocks);
  const props={divisionId:'template',divisionName:'Standard',configured:true,payoutSchedules:[]};
  reset();const fresh=renderToStaticMarkup(React.createElement(AddFeeDialog,props));
  assert.doesNotMatch(fresh,/value="side_pot"|value="insurance"|value="added_money"/);
  reset();const existing=renderToStaticMarkup(React.createElement(EditFeeDialog,{...props,fee:{id:'fee',kind:'side_pot',amountCents:5000,title:'Side pot',scope:'entry'}}));
  assert.match(existing,/value="side_pot"/);
});
test('payout editor hides new 4D and short-round choices but preserves existing ones',()=>{
  const {mocks,reset}=dialogMocks({four_d:false,short_rounds:false});
  const {PayoutScheduleDialog}=component('../src/components/settings/payout-schedule-dialog.tsx',mocks);
  reset();const fresh=renderToStaticMarkup(React.createElement(PayoutScheduleDialog,{enabled:true}));
  assert.doesNotMatch(fresh,/value="four_d"|Include a short-round payout/);
  const schedule={id:'schedule',name:'4D',competitionFormat:'four_d',shortRoundEnabled:true,bracketsByStage:{go_round:[],aggregate:[],short_round:[]}};
  reset();const existing=renderToStaticMarkup(React.createElement(PayoutScheduleDialog,{enabled:true,schedule}));
  assert.match(existing,/value="four_d"/);
  assert.match(existing,/Include a short-round payout/);
});
