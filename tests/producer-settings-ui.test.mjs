import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind, JsxEmit } from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function component(path, overrides={}) {
  const compiled={exports:{}};
  const source=transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,jsx:JsxEmit.ReactJSX}}).outputText;
  const imports=(name)=> {
    if (name in overrides) return overrides[name];
    if (name==='next/link') return {default:({children,...props})=>React.createElement('a',props,children)};
    return require(name);
  };
  new Function('require','module','exports',source)(imports,compiled,compiled.exports);
  return compiled.exports;
}

const {ProducerSettingsTabs,producerSettingsTabs}=component('../src/components/settings/producer-settings-tabs.tsx');
test('settings navigation keeps all groups available and marks only the selected group',()=>{
  for(const tab of producerSettingsTabs) {
    const html=renderToStaticMarkup(React.createElement(ProducerSettingsTabs,{active:tab.id}));
    assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
    assert.match(html,/overflow-x-auto/);
    for(const item of producerSettingsTabs) assert.ok(html.includes(item.label));
  }
  assert.equal(new Set(producerSettingsTabs.map(tab=>tab.href)).size,6);
});

const {StaffIdentity}=component('../src/components/settings/staff-identity.tsx');
test('staff names are primary, with email retained and names safely escaped',()=>{
  const html=renderToStaticMarkup(React.createElement(StaffIdentity,{name:'Avery <Smith>',email:'avery@example.com'}));
  assert.ok(html.indexOf('Avery &lt;Smith&gt;')<html.indexOf('avery@example.com'));
  assert.doesNotMatch(html,/<Smith>/);
  assert.match(renderToStaticMarkup(React.createElement(StaffIdentity,{name:' ',email:null})),/Name not provided.*No email/);
});

const producer={name:'Test Producer',publicName:'',email:'office@example.com',phone:'5551234567',timezone:'America/Chicago',allowGuestEntries:false};
const {ProducerSettingsForm}=component('../src/components/settings/producer-settings-form.tsx',{
  react:{...React,useActionState:()=>[{},()=>{},false]},
  '@/app/(app)/settings/actions':{updateProducerSettings:()=>{}},
  '@/components/ui/phone-input':{PhoneInput:props=>React.createElement('input',{...props,name:'phone'})},
  '@/components/events/entry-label':{useEntryLabelStyle:()=> 'number'},
});
test('general settings retain all fields and read-only permissions after regrouping',()=>{
  const editable=renderToStaticMarkup(React.createElement(ProducerSettingsForm,{producer,canEdit:true}));
  for(const name of ['name','publicName','email','phone','timezone','entryLabelStyle','allowGuestEntries']) assert.ok(editable.includes(`name="${name}"`));
  assert.match(editable,/flex-wrap/); assert.match(editable,/Save settings/);
  const readonly=renderToStaticMarkup(React.createElement(ProducerSettingsForm,{producer,canEdit:false}));
  assert.equal((readonly.match(/disabled=""/g)??[]).length,7);
  assert.doesNotMatch(readonly,/Save settings/);
});
