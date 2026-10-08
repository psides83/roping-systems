import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transpileModule, ModuleKind } from 'typescript';
import * as memberImport from '../src/lib/member-import.ts';
const require=createRequire(import.meta.url), compiled={exports:{}};
const source=transpileModule(readFileSync(new URL('../src/lib/history-import.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
new Function('require','module','exports',source)(name=>name==='./member-import'?memberImport:require(name),compiled,compiled.exports);
const {historyMoney,mapHistoryRows}=compiled.exports;
import { calculateQualificationStandings, calculateSeasonStandings } from '../src/lib/season-standings.ts';
const columns = { reference: '0', date: '1', memberNumber: '2', target: '3', value: '4' };
const sheet = [['Ref','Date','Member','Class','Money'],['old-1','06/30/2026','001','11.5','$1,245.67']];
test('migration mapping preserves member numbers and exact monetary amounts', () => {
  const { rows, errors } = mapHistoryRows(sheet,0,columns,{'11.5':'class-id'},'standings','mdy');
  assert.deepEqual(errors, []);
  assert.equal(rows[0].memberNumber,'001');
  assert.equal(rows[0].amountCents,124567);
  assert.equal(rows[0].count,0);
  assert.equal(rows[0].date,'2026-06-30');
  for (const value of ['-10','1,2','1.001','NaN','0']) assert.throws(() => historyMoney(value));
});
test('migration mapping rejects ambiguous targets, repeated references, invalid dates, fractional counts', () => {
  assert.equal(mapHistoryRows(sheet,0,columns,{},'standings','mdy').errors.length,1);
  assert.equal(mapHistoryRows([...sheet,sheet[1]],0,columns,{'11.5':'class-id'},'standings','mdy').errors.length,1);
  assert.equal(mapHistoryRows([sheet[0],['x','02/30/2026','001','11.5','1']],0,columns,{'11.5':'class-id'},'standings','mdy').errors.length,1);
  assert.equal(mapHistoryRows([sheet[0],['x','06/30/2026','001','11.5','1.5']],0,columns,{'11.5':'class-id'},'attendance','mdy').errors.length,1);
});
test('opening balances allow just one row per fund in a worksheet', () => {
  const result = mapHistoryRows([...sheet,['different','07/01/2026','','11.5','200']],0,columns,{'11.5':'fund-id'},'fund','mdy');
  assert.equal(result.errors.length,1);
});
const season={startsOn:'2026-05-01',endsOn:'2027-04-30'};
const contribution=(changes={})=>({roperId:'r',classId:'11.5',ropingId:'import:1',date:'2026-06-30',official:true,winningsCents:100000,attendanceCount:0,...changes});
test('historical winnings never fabricate attendance and combine with native winnings',()=>{
  const result=calculateSeasonStandings([contribution(),contribution({ropingId:'event',winningsCents:1000,attendanceCount:1})],[],season);
  assert.equal(result.rows[0].winningsCents,101000);
  assert.equal(result.rows[0].ropingsEntered,1);
});
test('historical attendance observes its separate qualification cutoff',()=>{
  const contributions=[contribution(),contribution({ropingId:'import:2',date:'2026-07-10',winningsCents:0,attendanceCount:8})];
  const result=calculateQualificationStandings(contributions,[],season,'2026-06-30','2026-07-10');
  assert.equal(result.rows[0].winningsCents,100000);assert.equal(result.rows[0].ropingsEntered,8);
  assert.equal(calculateSeasonStandings(contributions,[],season,'2026-06-29').rows.length,0);
});
test('imported winnings move with the roper while historical attendance stays in the original class',()=>{
  const result=calculateSeasonStandings([contribution(),contribution({ropingId:'import:2',winningsCents:0,attendanceCount:5})],
    [{id:'move',roperId:'r',fromClassId:'11.5',toClassId:'11',date:'2026-07-01',capAtLeader:false,classLadder:['11.5','11','10']}],season);
  assert.equal(result.rows.find(r=>r.classId==='11').winningsCents,100000);
  assert.equal(result.rows.find(r=>r.classId==='11.5').ropingsEntered,5);
});
