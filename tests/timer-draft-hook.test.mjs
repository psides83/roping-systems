import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import * as drafts from "../src/lib/events/timer-drafts.ts";

class Storage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key,value) { this.data.set(key,value); }
  removeItem(key) { this.data.delete(key); }
}
const scope={ userId: "staff", eventId: "event", ropingId: "roping", round: 1, runId: "run", name: "Austin Foster", rerunCount: 0, recordedAt: null };
const source=transpileModule(readFileSync(new URL("../src/components/events/use-timer-draft.ts",import.meta.url),"utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
async function mount(storage, overrides={}) {
  globalThis.window={ localStorage: storage, dispatchEvent() {}, confirm: () => true };
  const values=[]; let cursor=0; const effects=[]; let first=true;
  const compiled={ exports: {} };
  new Function("require","module","exports",source)((name) => {
    if (name === "@/lib/events/timer-drafts") return drafts;
    if (name !== "react") throw new Error(name);
    return {
      useState(initial) { const index=cursor++; if (!(index in values)) values[index]=typeof initial === "function" ? initial() : initial;
        return [values[index],(next) => { values[index]=typeof next === "function" ? next(values[index]) : next; }]; },
      useRef(initial) { const index=cursor++; if (!(index in values)) values[index]={ current: initial }; return values[index]; },
      useEffect(effect) { if (first) effects.push(effect); },
    };
  },compiled,compiled.exports);
  const render=() => { cursor=0; const api=compiled.exports.useTimerDraft({ ...scope, ...overrides },2); first=false; return api; };
  render(); for (const effect of effects) effect(); await Promise.resolve();
  return render;
}

test("Every changed reading and penalty is persisted before the page can be refreshed", async () => {
  const old=globalThis.window;
  try {
    const storage=new Storage(); const render=await mount(storage); let api=render();
    api.setTimes(() => ["12.31","12.35"]); api.setPenalties(["calf-down"]);
    const saved=drafts.readTimerDraft(storage,drafts.draftKey("staff","event","run",0));
    assert.deepEqual(saved.times,["12.31","12.35"]); assert.deepEqual(saved.penalties,["calf-down"]);
    const refreshed=await mount(storage); api=refreshed();
    assert.equal(api.restored,true); assert.equal(api.ready,true); assert.deepEqual(api.draft.times,saved.times);
  } finally { globalThis.window=old; }
});
test("A dropped confirmation retains one immutable submission through refresh and retry", async () => {
  const old=globalThis.window;
  try {
    const storage=new Storage(); const render=await mount(storage); let api=render();
    api.setTimes(() => ["12.31","12.35"]);
    const original=api.prepare("complete"); api.finish({ uncertain: true });
    const refreshed=await mount(storage); api=refreshed();
    api.setTimes(() => ["99","99"]);
    assert.deepEqual(api.prepare("turned_out").times,["12.31","12.35"]);
    assert.equal(api.prepare("turned_out").submission.id,original.submission.id);
    assert.equal(api.prepare("turned_out").submission.outcome,"complete");
    api.finish({ success: true });
    assert.equal(storage.getItem(drafts.draftKey("staff","event","run",0)),null);
  } finally { globalThis.window=old; }
});
test("A definite rejection preserves readings but permits correction before a new submission", async () => {
  const old=globalThis.window;
  try {
    const render=await mount(new Storage()); const api=render(); api.setTimes(() => ["12.31","12.35"]);
    const first=api.prepare("complete"); api.finish({ success: false }); api.setTimes(() => ["12.30","12.34"]);
    const next=api.prepare("complete"); assert.notEqual(next.submission.id,first.submission.id);
    assert.deepEqual(next.times,["12.30","12.34"]);
  } finally { globalThis.window=old; }
});
test("Changed run versions are retained for review rather than silently restored into a new attempt", async () => {
  const old=globalThis.window;
  try {
    const storage=new Storage(); const render=await mount(storage); const api=render(); api.setTimes(() => ["12.31","12.35"]);
    const changed=await mount(storage,{ recordedAt: "2026-10-08T12:00:00Z" }); const newer=changed();
    assert.equal(newer.stale,true); newer.setTimes(() => ["99","99"]);
    assert.deepEqual(drafts.readTimerDraft(storage,drafts.draftKey("staff","event","run",0)).times,["12.31","12.35"]);
  } finally { globalThis.window=old; }
});
test("Blocked browser storage is reported while readings remain available in the open page", async () => {
  const old=globalThis.window;
  try {
    const storage=new Storage(); storage.setItem=() => { throw new Error("Blocked storage"); };
    const render=await mount(storage); render().setTimes(() => ["12.31","12.35"]);
    const api=render(); assert.deepEqual(api.draft.times,["12.31","12.35"]); assert.match(api.storageError,/could not be saved/);
  } finally { globalThis.window=old; }
});
