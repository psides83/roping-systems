import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function editor(format = "standard", pending = false) {
  const compiled = { exports: {} }; let index = 0;
  const source = transpileModule(readFileSync(new URL("../src/components/settings/division-dialogs.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  const mocks = {
    react: { ...React, useEffect() {}, useRef: value => ({ current: value }), useState: initial => [index++ === 0 ? true : typeof initial === "function" ? initial() : initial, () => {}], useActionState: () => [{}, () => {}, pending] },
    "@/components/settings/producer-features-context": { useProducerFeatures: () => ({}) },
    "@/lib/producer-features": { featureEnabled: () => false },
    "@/app/(app)/settings/roping-templates/actions": {},
    "@/components/ui/dialog": { Dialog: "protected-dialog" },
    "@/components/ui/persistent-form": { PersistentForm: "save-form" },
    "@/components/ui/number-stepper": { NumberStepper: "number-stepper" },
    "@/components/help/context-help": { ContextHelp: "context-help" },
    "@/components/settings/delete-record-button": { DeleteRecordButton: "delete-button" },
    "@/components/events/short-round-settings": { ShortRoundFields: "short-round" },
  };
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  const wrapper = compiled.exports.EditDivisionDialog({ configured: true, divisions: [{ id: "division", name: "Breakaway" }], classifications: [], payoutSchedules: [{ id: "standard", competitionFormat: "standard", name: "Standard" }, { id: "4d", competitionFormat: "four_d", name: "4D" }], template: { id: "template", name: "Test", competitionFormat: format, disciplineId: "division", numberOfRuns: 2, maximumEntriesPerPerson: 2, timerCount: 2, minimumRunsBetweenEntries: 4, payoutScheduleId: format === "four_d" ? "4d" : "standard", shortRoundEnabled: true } });
  return wrapper.type(wrapper.props);
}
test("template groups preserve each editable field and existing defaults", () => {
  const tree = editor();
  const group = title => nodes(tree, node => node.type === "fieldset" && node.props.children?.[0]?.type === "legend" && node.props.children[0].props.children === title)[0];
  for (const [title, names] of [["1. Basics", ["name", "description", "isActive"]], ["2. Entries & rounds", ["numberOfRuns", "maximumEntries", "attendanceCountMode", "allowGuests"]], ["3. Timing & order", ["timerCount", "timerResolution", "minimumRunsBetweenEntries", "secondRoundOrdering", "laterRoundOrdering"]], ["4. Payouts", ["payoutScheduleId"]]]) {
    for (const name of names) {
      assert.equal(nodes(group(title), node => node.props?.name === name).length, 1, name);
      assert.equal(nodes(tree, node => node.props?.name === name).length, 1, name);
    }
  }
  assert.equal(nodes(tree, node => node.props?.name === "maximumEntries")[0].props.defaultValue, 2);
  assert.equal(nodes(tree, node => node.props?.name === "numberOfRuns")[0].props.defaultValue, 2);
  assert.equal(nodes(tree, node => node.type === "short-round")[0].props.defaultEnabled, true);
});
test("4D retains its required compatible payout selection", () => {
  const tree = editor("four_d");
  const payout = nodes(tree, node => node.props?.name === "payoutScheduleId")[0];
  assert.equal(payout.props.required, true);
  assert.equal(payout.props.defaultValue, "4d");
  assert.deepEqual(nodes(payout, node => node.type === "option").map(node => node.props.value), ["", "4d"]);
});
test("pending template saves protect dismissal and deletion", () => {
  const tree = editor("standard", true);
  assert.equal(nodes(tree, node => node.type === "protected-dialog")[0].props.busy, true);
  assert.equal(nodes(tree, node => node.type === "delete-button")[0].props.disabled, true);
  assert.equal(nodes(tree, node => node.type === "button" && node.props.children === "Cancel")[0].props.disabled, true);
});
