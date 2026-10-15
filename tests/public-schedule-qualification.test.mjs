import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicQualificationBullets } from '../src/lib/qualification-rule-sets.ts';
import { qualificationNoticeText } from '../src/lib/events/qualification-notice.ts';
const exports={};
const source=ts.transpileModule(fs.readFileSync(new URL('../src/components/events/public-roping-qualification.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','exports',source)(name=>name==='react/jsx-runtime'?jsx:{publicQualificationBullets,qualificationNoticeText},exports);
const notice={event_roping_id:'roping',rule_name:'Invitational',season_name:'2026',season_ends_on:'2026-12-31',requirements_available:true,top_places:25,minimum_ropings:10,cutoff_on:null,attendance_cutoff_on:null,requirement_match:'all',earned_position_policy:'none',bonus_entries_enabled:false};
const render=notice=>renderToStaticMarkup(jsx.jsx(exports.PublicRopingQualification,{notice}));
test('schedule publishes full requirements for ordinary as well as finals rules',()=>{
 const html=render(notice);
 assert.match(html,/Qualification required/);assert.match(html,/Top 25 in the season standings/);assert.match(html,/Must have attended 10 ropings/);assert.match(html,/do not bypass/);assert.match(html,/December 31, 2026/);
});
test('schedule preserves OR, earned exemptions, and distinct inclusive cutoffs',()=>{
 const html=render({...notice,requirement_match:'any',earned_position_policy:'rank',bonus_entries_enabled:true,cutoff_on:'2026-10-01',attendance_cutoff_on:'2026-10-08'});
 assert.match(html,/Meet either/);assert.match(html,/when the attendance requirement is met/);assert.match(html,/normal entry allowance/);assert.match(html,/October 1, 2026/);assert.match(html,/October 8, 2026/);
});
test('unavailable requirements show contact guidance without invented policy',()=>{
 const html=render({...notice,requirements_available:false});assert.match(html,/Contact the producer/);assert.doesNotMatch(html,/Top 25|do not bypass/);
});

const require = createRequire(import.meta.url);
test('qualified event schedules open automatically while ordinary schedules stay compact',()=>{
 const compiled={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/components/events/public-scheduled-event.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name==='next/link')return {default:({children})=>jsx.jsx('span',{children})};
  if(name.endsWith('/public-class-schedule'))return {PublicClassSchedule:()=>null};
  if(name.endsWith('/add-to-calendar'))return {AddToCalendar:()=>null};
  if(name.endsWith('/event-date-range'))return {eventDateRange:()=> 'October 17, 2026'};
  if(name.endsWith('/public-event-information'))return {PublicEventInformation:()=>null};
  if(name.endsWith('/producer-features-context'))return {ProducerFeatureGate:({children})=>children};
  return require(name);
 },compiled,compiled.exports);
 const event={id:'event',title:'Invitational',slug:'event',startsAt:'2026-10-17T14:00:00Z',status:'scheduled',venue:'Arena',address:'',entriesOpenAt:null,entriesCloseAt:null};
 for(const qualification of [undefined,notice]){
  const html=renderToStaticMarkup(jsx.jsx(compiled.exports.PublicScheduledEvent,{event:{...event,scheduledRopings:[{id:'roping',scheduledDate:'2026-10-17',qualification}]},producerSlug:'sample',timezone:'America/Chicago',configured:false,now:0}));
  assert.equal(/<details[^>]*open/.test(html),Boolean(qualification));
  if(qualification)assert.match(html,/Roping schedule &amp; qualification requirements/);
 }
});
