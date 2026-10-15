import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { qualificationCutoffText } from "../src/lib/qualification-rule-sets.ts";

const require = createRequire(import.meta.url);
const rule = { id: "rule", name: "Invitational", season_id: "season", minimum_ropings: 10, top_places: 15, requirement_match: "any", cutoff_on: null };
function renderAssignment(ropingId) {
  const states = [true, { eventRuleId: "rule", mode: "inherit", ruleId: null, rules: [rule] }, ropingId ? "inherit" : "custom", "rule", ""];
  const compiled = { exports: {} };
  const source = readFileSync(new URL("../src/components/events/qualification-assignment-dialog.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "react") return { ...React, useState: () => [states.shift(), () => {}], useTransition: () => [false, () => {}] };
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.includes("rule-set-actions")) return {};
    if (name.endsWith("qualification-rule-sets")) return { qualificationCutoffText };
    return (name === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(name));
  }, compiled, compiled.exports);
  return renderToStaticMarkup(React.createElement(compiled.exports.QualificationAssignmentDialog, { eventId: "event", ropingId, editable: true }));
}

test("event qualification has an explicit toggle and reusable rule selector", () => {
  const html = renderAssignment();
  assert.match(html, /Requires qualification/);
  assert.match(html, /Qualification rule set/);
  assert.match(html, /10 ropings attended AND|10 ropings attended OR/);
  assert.doesNotMatch(html, /Use different rules/);
});

test("roping qualification presents inheritance, opt-out, and custom choices", () => {
  const html = renderAssignment("roping");
  assert.match(html, /Use event rules/);
  assert.match(html, /No qualification required/);
  assert.match(html, /Use different rules/);
  assert.match(html, /Event rules: Invitational/);
});


test("assignment UI uses one rule selector for finals and other events", () => {
 const html = renderAssignment("roping");
 assert.match(html, /Roping qualification/);
 assert.match(html, /Finals rule sets are marked/);
 assert.match(html, /Manage qualification rules/);
});

function renderRuleForm(existing, finalsRule) {
 const compiled = { exports: {} }; let index = 0;
 const code = ts.transpileModule(readFileSync(new URL('../src/components/settings/qualification-rule-set-form.tsx', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name => {
  if(name==='react')return {...React,useState:initial=>[index++===0?true:initial,()=>{}],useTransition:()=>[false,()=>{}]};
  if(name.endsWith('/dialog'))return {Dialog:({title,children})=>React.createElement('section',null,React.createElement('h2',null,title),children)};
  if(name.endsWith('/persistent-form'))return {PersistentForm:({children})=>React.createElement('form',null,children)};
  if(name.endsWith('/cutoff-date-label'))return {CutoffDateLabel:()=>React.createElement('span',null,'Cutoff')};
  if(name.endsWith('/actions'))return {};
  return require(name);
 },compiled,compiled.exports);
 return renderToStaticMarkup(React.createElement(compiled.exports.QualificationRuleSetForm,{rule:existing,finalsRule,editable:true,seasons:[{id:'season',name:'2026',starts_on:'2026-01-01',ends_on:'2026-12-31'}]}));
}
test('qualification rules expose finals publication and earned-position settings together',()=>{
 const html=renderRuleForm();
 assert.match(html,/Create qualification rules/);
 assert.match(html,/name="is_finals"/);
 assert.match(html,/publish on public standings/);
 assert.match(html,/Earned qualifying positions/);
 assert.match(html,/Add earned positions to the normal entry allowance/);
});
test('finals flag and converted class scope survive editing',()=>{
 const html=renderRuleForm({...rule,is_finals:true,class_key:'class',earned_position_policy:'rank',bonus_entries_enabled:true});
 assert.match(html,/<input[^>]*name="is_finals"[^>]*checked/);
 assert.match(html,/name="class_key" value="class"/);
 assert.match(html,/retains its original classification scope/);
});

test('another designated finals rule disables the finals checkbox with an explanation',()=>{
 const html=renderRuleForm(undefined,{id:'current',name:'Season Finals',seasonName:'2026'});
 assert.match(html.match(/<input[^>]*name="is_finals"[^>]*>/)?.[0] ?? "", /disabled/);
 assert.match(html,/Season Finals \(2026\) is already the finals rule/);
 assert.match(html,/Clear its finals setting before marking a different rule/);
});
test('new rules require an explicit season selection',()=>{
 const html=renderRuleForm();
 assert.match(html,/Season \(required\)/);
 assert.match(html,/<select[^>]*name="season_id"[^>]*required/);
 assert.match(html,/<option value="" disabled="" selected="">Choose a season/);
});
test('the current finals rule remains editable',()=>{
 const html=renderRuleForm({...rule,id:'current',is_finals:true},{id:'current',name:'Season Finals',seasonName:'2026'});
 const checkbox=html.match(/<input[^>]*name="is_finals"[^>]*>/)?.[0];
 assert.ok(checkbox);assert.match(checkbox,/checked/);assert.doesNotMatch(checkbox,/disabled/);
});
