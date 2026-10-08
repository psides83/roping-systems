import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function renderControl({ status = null, enabled = true, canTakeover = false, sessionId = "tab-session", error = "" } = {}) {
  const compiled = { exports: {} };
  let index = 0;
  const states = [sessionId, status, error, false, false, ""];
  const source = transpileModule(readFileSync(new URL("../src/components/events/timing-control.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", source)((name) => {
    if (name === "react") return { ...React, useEffect() {}, useRef: (value) => ({ current: value }), useState: () => [states[index++], () => {}] };
    if (name === "@/lib/supabase/client") return { createClient() { throw new Error("Rendering must not contact Supabase"); } };
    if (name === "./use-desk-leave-guard") return { confirmDeskNavigation: () => true };
    return require(name);
  }, compiled, compiled.exports);
  const tree = compiled.exports.TimingControl({ ropingId: "roping", enabled, canTakeover, children: React.createElement("p", null, "Timing desk") });
  return { html: renderToStaticMarkup(tree), value: tree.props.value };
}

test("The desk starts read-only until timing ownership is confirmed", () => {
  const { html, value } = renderControl({ sessionId: "" });
  assert.equal(value.canWrite, false);
  assert.match(html, /Checking timing control/);
  assert.match(html, /disabled=""/);
});
test("The active session can release timing control", () => {
  const { html, value } = renderControl({ status: { ownsControl: true, holder: "Austin Foster", allowed: true, remainingSeconds: 90 } });
  assert.equal(value.canWrite, true);
  assert.match(html, /You have timing control/);
  assert.match(html, /Release control/);
});
test("Another timer is named without offering takeover to ordinary staff", () => {
  const { html, value } = renderControl({ status: { ownsControl: false, holder: "Austin Foster", allowed: true, remainingSeconds: 60 } });
  assert.equal(value.canWrite, false);
  assert.match(html, /Austin Foster has timing control/);
  assert.doesNotMatch(html, />Take over</);
});
test("Managers can request takeover but do not gain automatic write access", () => {
  const { html, value } = renderControl({ canTakeover: true, status: { ownsControl: false, holder: "Austin Foster", allowed: true, remainingSeconds: 60 } });
  assert.equal(value.canWrite, false);
  assert.match(html, />Take over</);
});
test("Timing access removed by the server overrides previously owned control", () => {
  const { html, value } = renderControl({ enabled: false, status: { ownsControl: true } });
  assert.equal(value.canWrite, false);
  assert.doesNotMatch(html, /Release control/);
  assert.match(html, /Timing desk/);
});
test("Connection and ownership failures are clearly announced", () => {
  const { html, value } = renderControl({ error: "Saving is paused until control is confirmed." });
  assert.equal(value.canWrite, false);
  assert.match(html, /role="alert"/);
  assert.match(html, /Saving is paused/);
});
