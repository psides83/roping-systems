import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicQualificationBullets } from '../src/lib/qualification-rule-sets.ts';
const exports = {};
const code = ts.transpileModule(fs.readFileSync(new URL('../src/components/events/published-finals-rules.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','exports',code)(name=>name==='react/jsx-runtime'?jsx:{publicQualificationBullets},exports);
const rule={id:'one',name:'Finals',top_places:25,minimum_ropings:10,cutoff_on:'2027-05-06',attendance_cutoff_on:'2027-05-06',requirement_match:'all',earned_position_policy:'none',bonus_entries_enabled:false};
const render=rules=>renderToStaticMarkup(jsx.jsx(exports.PublishedFinalsRules,{rules,seasonEndsOn:'2027-05-31'}));
test('single finals rule uses natural bullets without a redundant rule-name subheading',()=>{
 const html=render([rule]);
 assert.match(html,/<li>Top 25 in the season standings<\/li>/);
 assert.match(html,/<li>Must have attended 10 ropings<\/li>/);
 assert.match(html,/Bonus positions earned at select ropings do not bypass the qualification requirements/);
 assert.match(html,/May 6, 2027/);assert.doesNotMatch(html,/<h3|AND|2027-05-06/);
});
test('wording preserves earned-position policies and optional entry allowances',()=>{
 assert.match(publicQualificationBullets({...rule,earned_position_policy:'rank'}).join(' '),/when the attendance requirement is met/);
 assert.match(publicQualificationBullets({...rule,earned_position_policy:'rank_and_attendance',bonus_entries_enabled:true}).join(' '),/bypass the standings and attendance requirements.*added to its normal entry allowance/);
});
test('either requirement and distinct finals remain explicit',()=>{
 assert.match(render([{...rule,requirement_match:'any'}]),/Meet either the standings or attendance requirement/);
 const html=render([rule,{...rule,id:'two',name:'Invitational finals'}]);
 assert.match(html,/<h3[^>]*>Finals<\/h3>/);assert.match(html,/Invitational finals/);
 assert.equal(render([]),'');
});
