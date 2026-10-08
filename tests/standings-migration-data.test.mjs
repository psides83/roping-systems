import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
const code=transpileModule(readFileSync(new URL('../src/lib/events/season-standings-data.ts',import.meta.url),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
test('standings loader preserves migration money and only reads real event awards',async()=>{
  const calls=[];
  const contributions=[{source:'migration',winningsCents:123456,entryIds:[],eventId:null},
    {winningsCents:0,entryIds:['entry'],eventId:'event'}];
  const db={rpc(name,params){
    calls.push({name,params});
    if(name==='public_season_standings_source') return Promise.resolve({data:{contributions,moves:[],classes:[],ropers:[]}});
    const query={order(){return query;},range(){return Promise.resolve({data:[{entry_id:'entry',payout_cents:500},{entry_id:'entry',payout_cents:200}]});}};
    return query;
  }};
  const compiled={exports:{}};
  new Function('require','module','exports',code)(name=>name==='server-only'?{}:{createClient:async()=>db},compiled,compiled.exports);
  const result=await compiled.exports.loadSeasonStandings('producer','season');
  assert.equal(result.contributions[0].winningsCents,123456);
  assert.equal(result.contributions[1].winningsCents,700);
  assert.deepEqual(calls.filter(c=>c.name==='public_event_money_results').map(c=>c.params.target_event_id),['event']);
});
