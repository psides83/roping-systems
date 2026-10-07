import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transpileModule, ModuleKind } from 'typescript';

test('import choices include active Open and skill classifications, excluding age and inactive records', async () => {
  const classifications = [
    { id:'open', name:'Open', eligibility_type:'open', is_active:true },
    { id:'a', name:'A', eligibility_type:'skill', is_active:true },
    { id:'youth', name:'Youth', eligibility_type:'age', is_active:true },
    { id:'old', name:'Retired', eligibility_type:'open', is_active:false },
  ];
  const query = { select:()=>query, eq:()=>query, order:async()=>({ data:[{ id:'ba', name:'Breakaway', classifications }], error:null }) };
  const compiled = { exports:{} };
  const source = transpileModule(readFileSync(new URL('../src/app/(app)/members/import/actions.ts',import.meta.url),'utf8'), { compilerOptions:{ module:ModuleKind.CommonJS } }).outputText;
  new Function('require','module','exports',source)((name) => {
    if (name === '@/lib/producers') return { getActiveProducer:async()=>({ id:'producer', role:'owner' }) };
    if (name === '@/lib/supabase/server') return { createClient:async()=>({ from:()=>query }) };
    return {};
  },compiled,compiled.exports);
  const choices = await compiled.exports.loadImportChoices();
  assert.deepEqual(choices[0].classifications.map((item)=>item.id),['open','a']);
});
