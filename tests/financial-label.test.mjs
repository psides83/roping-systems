import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);

test('financial help closes outside, on focus leaving, and on Escape; listeners are cleaned up',()=>{
  const handlers=new Map();
  const document={addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener:(name,handler)=>{
    assert.equal(handlers.get(name),handler); handlers.delete(name);
  }};
  class Node {}
  const inside=new Node(),outside=new Node();
  let focused=false,cleanup;
  const details={open:true,contains:target=>target===inside,querySelector:()=>({focus:()=>{focused=true;}})};
  const compiled={exports:{}};
  const source=ts.transpileModule(readFileSync(new URL('../src/components/ui/financial-label.tsx',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  new Function('require','module','exports','document','Node',source)(name=>name==='react'?{
    useId:()=> 'help-id',useRef:()=>({current:details}),useEffect:fn=>{cleanup=fn();},
  }:require(name),compiled,compiled.exports,document,Node);
  compiled.exports.FinancialLabel({label:'Non-payout fees collected',help:'Production, stock, and office charges.'});
  handlers.get('pointerdown')({target:inside});
  assert.equal(details.open,true);
  handlers.get('pointerdown')({target:outside});
  assert.equal(details.open,false);
  details.open=true;
  handlers.get('focusin')({target:outside});
  assert.equal(details.open,false);
  details.open=true;
  handlers.get('keydown')({key:'Enter'});
  assert.equal(details.open,true);
  handlers.get('keydown')({key:'Escape'});
  assert.equal(details.open,false);
  assert.equal(focused,true);
  cleanup();
  assert.equal(handlers.size,0);
});
