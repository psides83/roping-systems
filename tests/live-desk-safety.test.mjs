import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function compile(path, imports) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  return compiled.exports;
}

test("Desk switching checks unsaved work and refuses to interrupt saving", () => {
  const { confirmDeskNavigation } = compile("../src/components/events/use-desk-leave-guard.ts", () => ({ useEffect() {} }));
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  let guards = [];
  let confirmations = 0;
  let alerts = 0;
  globalThis.document = { querySelectorAll: () => guards };
  globalThis.window = { confirm: () => { confirmations++; return false; }, alert: () => { alerts++; } };
  try {
    assert.equal(confirmDeskNavigation(), true);
    guards = [{ dataset: { deskSaving: "false" } }];
    assert.equal(confirmDeskNavigation(), false);
    assert.equal(confirmations, 1);
    guards[0].dataset.deskSaving = "true";
    assert.equal(confirmDeskNavigation(), false);
    assert.equal(alerts, 1);
    assert.equal(confirmations, 1);
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
});

function renderTiming({ pending = false, fineBlocked = false, state = {}, asTree = false, times = [] } = {}) {
  const { RunEntryForm } = compile("../src/components/events/live-run-entry-form.tsx", (name) => {
    if (name === "react") return { ...React, useActionState: () => [state, () => {}, pending], useState: (value) => { const initial = typeof value === "function" ? value() : value; return [Array.isArray(initial) && initial.length === 2 && times.length ? times : initial, () => {}]; }, useMemo: (fn) => fn(), useRef: () => ({ current: false }), useEffect() {} };
    if (name.endsWith("/actions")) return { recordRun() {} };
    if (name === "./entry-label") return { EntryLabel: ({ number }) => React.createElement("span", null, number), useEntryLabelStyle: () => "number" };
    if (name === "./penalty-choices") return { PenaltyChoices: () => null };
    if (name === "./use-desk-leave-guard") return { useDeskLeaveGuard() {} };
    if (name.startsWith("@/lib/")) return compile(`../src/lib/${name.slice(6)}.ts`, require);
    return require(name);
  });
  const element = RunEntryForm({
    eventId: "event", run: { id: "run", name: "Austin Foster", entryNumber: 2, drawPosition: 7,
      carryTime: null, incentiveAdjustment: 0, fineBlocked },
    timerCount: 2, timerResolution: "average", canEdit: true, isShortRound: false,
    roundLabel: "Round 2", ropingName: "#11.5 Tie-down",
  });
  return asTree ? element : renderToStaticMarkup(element);
}
test("Timing form identifies contestant, roping, round and draw", () => {
  const html = renderTiming();
  for (const label of ["Austin Foster", "#11.5 Tie-down", "Round 2", "Draw 7", "Timer 1", "Timer 2", "Other outcomes"]) assert.ok(html.includes(label), label);
});
test("Saving disables timer inputs and shows clear progress", () => {
  const html = renderTiming({ pending: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Saving result/);
  assert.equal((html.match(/<input[^>]*>/g) ?? []).filter((input) => input.includes('name="timerReading"') && input.includes('disabled=""')).length, 2);
});
test("An unpaid fine blocks timer entry without hiding other outcomes", () => {
  const html = renderTiming({ fineBlocked: true });
  assert.match(html, /Competition blocked/);
  assert.equal((html.match(/<input[^>]*>/g) ?? []).filter((input) => input.includes('name="timerReading"') && input.includes('disabled=""')).length, 2);
  assert.match(html, /Turn out/);
});
test("Save failures are announced as alerts", () => assert.match(renderTiming({ state: { message: "Connection failed. Try again." } }), /role="alert"/));

test("Repeated submissions cannot enqueue another result", () => {
  const tree = renderTiming({ asTree: true });
  let prevented = 0;
  const oldButton = globalThis.HTMLButtonElement;
  globalThis.HTMLButtonElement = class {};
  try {
    const event = { nativeEvent: { submitter: null }, preventDefault: () => prevented++ };
    tree.props.onSubmit(event);
    tree.props.onSubmit(event);
    assert.equal(prevented, 1);
  } finally { globalThis.HTMLButtonElement = oldButton; }
});

test("Cancelling an exceptional outcome leaves the form usable", () => {
  const tree = renderTiming({ asTree: true, times: ["11.20", "11.22"] });
  const oldButton = globalThis.HTMLButtonElement;
  const oldWindow = globalThis.window;
  class Button { constructor(value) { this.value = value; } }
  globalThis.HTMLButtonElement = Button;
  let message = "";
  let prevented = 0;
  globalThis.window = { confirm: (value) => { message = value; return false; } };
  try {
    tree.props.onSubmit({ nativeEvent: { submitter: new Button("disqualified") }, preventDefault: () => prevented++ });
    assert.match(message, /Austin Foster, Round 2, entry/);
    assert.match(message, /timer readings will not count/);
    tree.props.onSubmit({ nativeEvent: { submitter: new Button("complete") }, preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
  } finally { globalThis.HTMLButtonElement = oldButton; globalThis.window = oldWindow; }
});
