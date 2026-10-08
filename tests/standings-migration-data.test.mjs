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
test('cached public standings use an anonymous client, not staff cookies',async()=>{
  let options;
  const db={rpc:async()=>({data:{contributions:[],moves:[],classes:[],ropers:[]}})};
  const compiled={exports:{}};
  new Function('require','module','exports',code)(name=>{
    if(name==='server-only')return{};
    if(name==='@supabase/supabase-js')return{createClient:(url,key,config)=>{
      assert.equal(url,'https://public.example');assert.equal(key,'public-key');options=config;return db;
    }};
    if(name==='@/lib/supabase/config')return{getSupabaseConfig:()=>({url:'https://public.example',key:'public-key'})};
    return{createClient:()=>{throw new Error('Staff cookies must not be read');}};
  },compiled,compiled.exports);
  await compiled.exports.loadSeasonStandings('producer','season',true);
  assert.equal(options.auth.persistSession,false);
  assert.equal(options.auth.detectSessionInUrl,false);
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async(input,init)=>{assert.equal(init.cache,'force-cache');assert.equal(init.next.revalidate,30);return new Response('{}');};
    await options.global.fetch('https://public.example/rest/v1/rpc/public_season_standings_source',{method:'POST'});
  }finally{globalThis.fetch=original;}
});
