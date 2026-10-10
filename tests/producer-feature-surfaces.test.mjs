import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { featureEnabled, producerFeatures, producerFeatureDescriptions } from '../src/lib/producer-features.ts';
import { nextSeasonDates } from '../src/lib/season-rollover.ts';
const require = createRequire(import.meta.url);
test('all feature preferences explain their effect',()=>{
  for(const feature of producerFeatures) assert.ok(producerFeatureDescriptions[feature.key]?.length > 30,feature.key);
});
test('feature form associates each checkbox with its explanation',()=>{
  const {ProducerFeaturesForm}=component('../src/components/settings/producer-features-form.tsx',{
    react:{...React,useActionState:()=>[{},()=>{},false]},
    '@/lib/producer-features':{featureEnabled,producerFeatures,producerFeatureDescriptions},
    '@/app/(app)/settings/features/actions':{saveFeatures:()=>{}},
  });
  const html=renderToStaticMarkup(React.createElement(ProducerFeaturesForm,{features:{},revision:0,editable:true}));
  for(const feature of producerFeatures){
    assert.ok(html.includes(`aria-describedby="feature-${feature.key}-description"`));
    assert.ok(html.includes(`id="feature-${feature.key}-description"`));
  }
});
test('rollover disables new dues and qualification copies while preserving existing fund balances',()=>{
  const mocks={
    react:{...React,useActionState:()=>[{},()=>{},false]},
    '@/components/settings/producer-features-context':{useProducerFeatures:()=>({dues:false,qualifications:false,funds:false})},
    '@/lib/producer-features':{featureEnabled},
    '@/lib/season-rollover':{nextSeasonDates},
    '@/lib/utils':{formatCurrencyExact:n=>`$${n/100}`},
    '@/app/(app)/settings/seasons/rollover/actions':{startNextSeason:()=>{}},
  };
  const {SeasonRolloverForm}=component('../src/components/settings/season-rollover-form.tsx',mocks);
  const props={seasons:[{id:'s',name:'2026',starts_on:'2026-01-01',ends_on:'2026-12-31'}],sourceId:'s',settings:{amount_cents:5000,allocation_mode:'fixed',allocation_value:0},seasonal:[],funds:[],activeMembers:10,ruleCounts:{s:2}};
  const render=extra=>renderToStaticMarkup(React.createElement(SeasonRolloverForm,{...props,...extra}));
  const empty=render({});
  assert.match(empty,/<fieldset hidden="" disabled=""/);
  assert.match(empty,/name="mode" value="fixed"/);
  assert.doesNotMatch(empty,/name="copyQualifications"|name="duesEnabled"[^>]*checked|<table/);
  const existing=render({funds:[{id:'fund',name:'General fund',is_active:false,balance_cents:50000,reserved_cents:0,available_cents:50000}]});
  assert.match(existing,/General fund \(inactive\)/);
  assert.match(existing,/\$500/);
  mocks['@/components/settings/producer-features-context'].useProducerFeatures=()=>({funds:false});
  const active=render({settings:{amount_cents:5000,allocation_mode:'fixed',allocation_value:1000,fund_id:'fund'},funds:[{id:'fund',name:'General fund',is_active:false,balance_cents:50000,reserved_cents:0,available_cents:50000}]});
  assert.match(active,/<option value="fund" selected="">General fund \(inactive\)<\/option>/);
  assert.match(active,/name="allocation"[^>]*value="10.00"/);
  assert.doesNotMatch(active,/<div hidden=""><div class="flex flex-wrap items-end gap-3">/);
});
test('new event qualification controls disappear when disabled',()=>{
  const {EventQualificationFields}=component('../src/components/events/event-qualification-fields.tsx',{
    '@/components/settings/producer-features-context':{useProducerFeatures:()=>({qualifications:false})},
    '@/lib/producer-features':{featureEnabled},
    '@/app/(app)/events/[eventId]/rule-set-actions':{loadAvailableQualificationRuleSets:()=>{throw new Error('Should not load disabled rules');}},
  });
  assert.equal(renderToStaticMarkup(React.createElement(EventQualificationFields)),'');
});
test('dues hide unused fund settings but preserve existing allocations',()=>{
  const {MembershipDuesSettings}=component('../src/components/members/dues-settings.tsx',{
    '@/components/settings/producer-features-context':{useProducerFeatures:()=>({funds:false})},
    '@/lib/producer-features':{featureEnabled},
    '@/app/(app)/members/dues/actions':{duesAction:()=>{}},
  });
  const render=settings=>renderToStaticMarkup(React.createElement(MembershipDuesSettings,{settings,funds:[],enabled:true}));
  assert.match(render(null),/<div hidden="" class="space-y-5">/);
  assert.match(render(null),/name="allocation"/);
  assert.doesNotMatch(render({fund_id:'fund',allocation_value:1000,allocation_mode:'fixed',amount_cents:5000}),/<div hidden=""/);
});
function component(path, mocks) {
  const compiled = {exports:{}};
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions:{module:ModuleKind.CommonJS,jsx:JsxEmit.ReactJSX,target:ScriptTarget.ES2022}}).outputText;
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
