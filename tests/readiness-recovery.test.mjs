import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function harness(kind, responses) {
 const states = [], refs = [], effects = [], tasks = [], ready = []; let index = 0, refIndex = 0;
 const exports = {};
 const jsx = (type, props) => ({type, props});
 const source = ts.transpileModule(fs.readFileSync(new URL(`../src/components/events/${kind}-readiness-${kind === 'final' ? 'check' : 'form'}.tsx`, import.meta.url), 'utf8'), { compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX} }).outputText;
 const load = async () => { const next = responses.shift(); if (next instanceof Error) throw next; return next; };
 new Function('require','exports',source)(name => {
  if (name === 'react') return { useState(initial) { const n=index++; if (!(n in states)) states[n]=initial; return [states[n], value=>{states[n]=value;}]; }, useRef(initial) { const n=refIndex++; return refs[n] ??= {current:initial}; }, useEffect(effect) {effects.push(effect);}, useTransition:()=>[false,fn=>tasks.push(fn())] };
  if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'fragment'};
  if (name.endsWith('/readiness-actions')) return { getFinalReadiness:load };
  if (name.endsWith('/setup-readiness-actions')) return { getSetupReadiness:load };
  if (name.endsWith('/persistent-form')) return {PersistentForm:'form'};
  if (name.endsWith('/utils')) return {formatCurrency:String};
  return {};
 },exports);
 const render = () => { index=0;refIndex=0; return kind === 'final' ? exports.FinalReadinessCheck({ eventId:'event', onReady:value=>ready.push(value) }) : exports.SetupReadinessForm({ eventId:'event', mode:'publish', action(){}, children:'Publish', pending:false }); };
 function nodes(tree,predicate) { if (!tree || typeof tree !== 'object') return []; if(Array.isArray(tree))return tree.flatMap(t=>nodes(t,predicate));return [...(predicate(tree)?[tree]:[]),...nodes(tree.props?.children,predicate)]; }
 return {render,states,ready,effects,done:()=>Promise.all(tasks),find:(tree,predicate)=>nodes(tree,predicate)[0]};
}
test('final readiness failure leaves completion blocked and refresh recovers', async () => {
 const h=harness('final',[new Error('offline'),{summary:{blocked:false,pending:0,reruns:0,ropings:[]}}]);
 h.render(); h.effects[0](); await h.done();
 assert.deepEqual(h.ready,[false]); assert.match(h.states[0].message,/Unable to check event readiness/);
 h.find(h.render(),n=>n.type==='button').props.onClick();
 assert.equal(h.ready.at(-1),false); await h.done();
 assert.equal(h.ready.at(-1),true); assert.equal(h.states[0].message,undefined);
});
test('refresh failure clears a previously successful final readiness result', async () => {
 const h=harness('final',[{summary:{blocked:false,pending:0,reruns:0,ropings:[]}},new Error('offline')]);
 h.render();h.effects[0]();await h.done();assert.equal(h.ready.at(-1),true);
 h.find(h.render(),n=>n.type==='button').props.onClick();await h.done();
 assert.equal(h.ready.at(-1),false);assert.equal(h.states[0].summary,undefined);
});
test('setup review failure blocks publish until a successful retry', async () => {
 const h=harness('setup',[new Error('offline'),{issues:[]}]);
 h.find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.done();
 assert.match(h.states[1].message,/Nothing has been published or started/);
 let tree=h.render();assert.equal(h.find(tree,n=>n.type==='button' && Array.isArray(n.props.children) && n.props.children.includes('Publish event')).props.disabled,true);
 h.find(tree,n=>n.props?.['aria-label']==='Refresh setup review').props.onClick();await h.done();
 tree=h.render();assert.equal(h.find(tree,n=>n.type==='button' && Array.isArray(n.props.children) && n.props.children.includes('Publish event')).props.disabled,false);
});
