import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinalsQualifications as calculate, validateFinalsQualificationRule } from '../src/lib/finals-qualifications.ts';

const rule = (overrides={}) => ({ id:'r1',producerId:'producer',seasonId:'season',classId:'11',ropingId:'roping',stage:'aggregate',round:null,places:[{place:1,positions:1},{place:2,positions:1}],repeatPolicy:'accumulate',tiePolicy:'all',maximumPositions:null,...overrides });
const finish = (memberId,place,overrides={}) => ({ producerId:'producer',seasonId:'season',classId:'11',ropingId:'roping',stage:'aggregate',round:null,date:'2026-10-01',official:true,entryId:`entry-${memberId}`,memberId,place,...overrides });
const manual = (overrides={}) => ({ id:'m1',producerId:'producer',seasonId:'season',classId:'11',memberId:'a',date:'2026-09-01',positions:1,reason:'Staff-approved qualifier correction',revoked:false,...overrides });
const total = (result,member,classification='11') => result.totals.find((row)=>row.memberId===member && row.classId===classification)?.positions ?? 0;

test('selected places earn configurable counts only from official finishes',()=>{
  const result=calculate([rule({places:[{place:1,positions:2},{place:3,positions:1}]})],[finish('a',1),finish('b',2),finish('c',3),finish('d',1,{official:false})]);
  assert.equal(total(result,'a'),2); assert.equal(total(result,'b'),0); assert.equal(total(result,'c'),1); assert.equal(total(result,'d'),0);
});
test('go rounds, short round, and aggregate match independently',()=>{
  const result=calculate([rule({stage:'go_round',round:2})],[finish('a',1,{stage:'go_round',round:1}),finish('b',1,{stage:'go_round',round:2}),finish('c',1,{stage:'short_round'})]);
  assert.equal(total(result,'a'),0); assert.equal(total(result,'b'),1); assert.equal(total(result,'c'),0);
});
test('producer, season, and class boundaries never combine',()=>{
  const result=calculate([rule()],[finish('a',1,{producerId:'other'}),finish('b',1,{seasonId:'other'}),finish('c',1,{classId:'10'})]);
  assert.equal(result.totals.length,0);
});
test('caps clip additional awards and unlimited rules allow repeat wins',()=>{
  const finishes=[finish('a',1)];
  assert.equal(total(calculate([rule({places:[{place:1,positions:3}],maximumPositions:2})],finishes,[manual()]),'a'),2);
  assert.equal(total(calculate([rule({places:[{place:1,positions:3}]})],finishes,[manual()]),'a'),4);
});
test('skip leaves a repeat winner position unused; pass-down finds the next eligible member',()=>{
  const finishes=[finish('a',1),finish('b',2),finish('c',3)];
  const skipped=calculate([rule({repeatPolicy:'skip'})],finishes,[manual()]);
  assert.equal(total(skipped,'a'),1); assert.equal(total(skipped,'b'),1); assert.equal(total(skipped,'c'),0);
  const passed=calculate([rule({repeatPolicy:'pass_down'})],finishes,[manual()]);
  assert.equal(total(passed,'b'),1); assert.equal(total(passed,'c'),1);
});
test('ties can qualify everyone or wait for staff without silently awarding the next place',()=>{
  const finishes=[finish('a',1),finish('b',1),finish('c',3)];
  assert.equal(calculate([rule({places:[{place:1,positions:1}]})],finishes).totals.length,2);
  const held=calculate([rule({places:[{place:1,positions:1}],repeatPolicy:'pass_down',tiePolicy:'staff_decision'})],finishes);
  assert.equal(held.totals.length,0); assert.equal(held.issues[0].reason,'tie_requires_decision');
});
test('nonmembers do not earn member positions and pass-down can advance past them',()=>{
  const result=calculate([rule({places:[{place:1,positions:1}],repeatPolicy:'pass_down'})],[finish(null,1),finish('b',2)]);
  assert.equal(total(result,'b'),1);
});
test('multiple entries accumulate only when the producer permits repeat qualifications',()=>{
  const finishes=[finish('a',1),finish('a',2,{entryId:'entry-a2'})];
  assert.equal(total(calculate([rule()],finishes),'a'),2);
  assert.equal(total(calculate([rule({repeatPolicy:'skip'})],finishes),'a'),1);
});
test('recalculating corrected or withdrawn official results never duplicates earlier credits',()=>{
  const first=calculate([rule()],[finish('a',1)]); const second=calculate([rule()],[finish('a',1)]);
  assert.deepEqual(first,second);
  assert.equal(total(calculate([rule()],[finish('a',1,{official:false})]),'a'),0);
});
test('staff-approved class transfers retain source provenance and change the finals class',()=>{
  const move={id:'move',producerId:'producer',seasonId:'season',memberId:'a',fromClassId:'11',toClassId:'10',date:'2026-10-02',decision:'transfer',reason:'Retain earned finals position'};
  const result=calculate([rule()],[finish('a',1)],[],[move]);
  assert.equal(total(result,'a'),0); assert.equal(total(result,'a','10'),1); assert.equal(result.awards[0].earnedClassId,'11'); assert.deepEqual(result.awards[0].moves,['move']);
});
test('staff can revoke positions on a class move without deleting their history',()=>{
  const result=calculate([],[],[manual()],[{id:'move',producerId:'producer',seasonId:'season',memberId:'a',fromClassId:'11',toClassId:'10',date:'2026-10-02',decision:'revoke',reason:'Position does not carry to new class'}]);
  assert.equal(result.totals.length,0); assert.equal(result.awards[0].revoked,true);
});
test('revoked manual positions do not establish eligibility',()=>assert.equal(calculate([],[],[manual({revoked:true})]).totals.length,0));
test('invalid places, duplicate stages, missing move decisions and duplicate finishes are rejected',()=>{
  assert.ok(validateFinalsQualificationRule(rule({places:[{place:1,positions:0}]})).length);
  assert.throws(()=>calculate([rule(),rule({id:'r2'})],[]),/each qualification stage once/);
  assert.throws(()=>calculate([rule()],[finish('a',1),finish('a',1)]),/more than once/);
  assert.throws(()=>calculate([],[],[],[{id:'move',date:'2026-10-01',fromClassId:'11',toClassId:'10',reason:''}]),/staff decision/);
});
