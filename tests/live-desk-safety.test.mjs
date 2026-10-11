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

function renderTiming({ pending = false, fineBlocked = false, state = {}, asTree = false, times = [], ownsControl = true, online = true, storageError = "", restored = false, submission } = {}) {
  const { RunEntryForm } = compile("../src/components/events/live-run-entry-form.tsx", (name) => {
    if (name === "react") return { ...React, useActionState: () => [state, () => {}, pending], useState: (value) => { const initial = typeof value === "function" ? value() : value; return [Array.isArray(initial) && initial.length === 2 && times.length ? times : initial, () => {}]; }, useMemo: (fn) => fn(), useRef: () => ({ current: false }), useEffect() {} };
    if (name.endsWith("/actions")) return { recordRun() {} };
    if (name === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (name === "./use-network-status") return { useNetworkStatus: () => online };
    if (name === "./use-timer-draft") return { useTimerDraft: () => ({ ready: true, restored, stale: false, storageError, draft: { times: times.length ? times : ["", ""], penalties: [], submission }, setTimes() {}, setPenalties() {}, prepare() {}, finish() {}, discard() {} }) };
    if (name === "./entry-label") return { EntryLabel: ({ number }) => React.createElement("span", null, number), useEntryLabelStyle: () => "number" };
    if (name === "./penalty-choices") return { PenaltyChoices: () => null };
    if (name === "./use-desk-leave-guard") return { useDeskLeaveGuard() {} };
    if (name === "./timing-control") return { useTimingControl: () => ({ sessionId: "browser-session", canWrite: ownsControl, staffUserId: "staff" }) };
    if (name.startsWith("@/lib/")) return compile(`../src/lib/${name.slice(6)}.ts`, require);
    return (name === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(name));
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

test("Recovered drafts and local-only saves are clearly distinguished from server saves", () => {
  assert.match(renderTiming({ restored: true, times: ["12.20","12.24"] }),/Recovered draft from this device/);
  assert.match(renderTiming({ times: ["12.20","12.24"] }),/Not yet saved to server/);
  assert.match(renderTiming({ state: { success: true } }),/Saved to server/);
});
test("Losing connectivity prevents submission without erasing displayed readings", () => {
  const html=renderTiming({ online: false, times: ["12.20","12.24"] });
  assert.match(html,/Connection lost/); assert.match(html,/value="12.20"/);
  assert.ok((html.match(/<button[^>]*name="status"[^>]*>/g) ?? []).every((button) => button.includes('disabled=""')));
});
test("Unconfirmed saves hold readings unchanged and offer a retry of the original outcome", () => {
  const html=renderTiming({ times: ["12.20","12.24"], submission: { id: "same-request", outcome: "turned_out", uncertain: true } });
  assert.match(html,/Retry save &amp; confirm result/);
  assert.ok((html.match(/<input[^>]*name="timerReading"[^>]*>/g) ?? []).every((input) => input.includes('disabled=""')));
});
test("Storage failures never claim the draft was safely saved on the device", () => {
  const html=renderTiming({ times: ["12.20","12.24"], storageError: "Storage unavailable" });
  assert.match(html,/only held in this open page/); assert.doesNotMatch(html,/Draft saved on this device/);
});

test("A view-only timing session cannot edit readings or record an outcome", () => {
  const html = renderTiming({ ownsControl: false });
  assert.match(html, /name="timingSessionId" value="browser-session"/);
  const inputs = (html.match(/<input[^>]*>/g) ?? []).filter((input) => input.includes('name="timerReading"'));
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.includes('disabled=""')));
  const buttons = (html.match(/<button[^>]*>/g) ?? []).filter((button) => button.includes('name="status"'));
  assert.ok(buttons.length > 0 && buttons.every((button) => button.includes('disabled=""')));
});

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
