import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const compiled = { exports: {} };
const source = readFileSync(new URL("../src/lib/events/desk-workflow.ts", import.meta.url), "utf8");
new Function("require", "module", "exports", transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText)(() => ({ isResolvedRunStatus: (status) => ["complete", "no_time", "disqualified", "turned_out", "scratched"].includes(status) }), compiled, compiled.exports);
const { deskWorkflowState } = compiled.exports;
const ready = { eventStatus: "in_progress", roundLocked: false, drawReady: true, dirty: false,
  isShortRound: false, shortRoundSeeded: false, shortRoundLocked: false,
  mainRoundsComplete: false, runs: [{ status: "pending" }] };

test("Ready desk accepts the next pending run", () => assert.equal(deskWorkflowState(ready), null));
for (const [overrides, title] of [
  [{ eventStatus: "completed" }, "Competition completed"],
  [{ eventStatus: "cancelled" }, "Event cancelled"],
  [{ ropingStatus: "completed" }, "Roping completed"],
  [{ roundLocked: true }, "Round completed"],
  [{ dirty: true }, "Unsaved order"],
  [{ drawReady: false }, "Order not built"],
  [{ eventStatus: "published" }, "Ready to start"],
  [{ runs: [] }, "Waiting for entries"],
  [{ isShortRound: true }, "Review short-round field"],
  [{ isShortRound: true, runs: [] }, "Short round not built"],
  [{ isShortRound: true, shortRoundSeeded: true, runs: [] }, "No short-round qualifiers"],
  [{ runs: [{ status: "rerun" }] }, "Reruns awaiting scheduling"],
  [{ runs: [{ status: "complete" }, { status: "turned_out" }] }, "Ready to complete round"],
]) {
  test(`Desk clearly displays ${title}`, () => assert.equal(deskWorkflowState({ ...ready, ...overrides }).title, title));
}
test("Locked short-round field accepts pending times", () => assert.equal(deskWorkflowState({ ...ready, isShortRound: true, shortRoundLocked: true }), null));
test("Completed event takes precedence over a missing draw", () => assert.equal(deskWorkflowState({ ...ready, eventStatus: "completed", drawReady: false, runs: [] }).title, "Competition completed"));
test("No-time outcomes bypass timer input validation, but qualified times do not", () => {
  const ui = readFileSync(new URL("../src/components/events/live-run-entry-form.tsx", import.meta.url), "utf8");
  for (const outcome of ["no_time", "disqualified", "turned_out", "rerun"]) assert.match(ui, new RegExp(`value="${outcome}"\\s+formNoValidate`));
  assert.doesNotMatch(ui, /value="complete"\s+formNoValidate/);
});
