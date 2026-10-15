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
function setup({ pending = false, state = {} } = {}) {
  const values = [true];
  let index = 0;
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL("../src/components/events/create-roping-dialog.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  const mocks = {
    react: { ...React, useId: () => "slug-help", useEffect() {}, useActionState: () => [state, () => {}, pending], useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; } },
    "@/components/ui/dialog": { Dialog: "dialog-shell" },
    "@/components/help/context-help": { ContextHelp: "context-help" },
    "@/components/ui/number-stepper": { NumberStepper: "number-stepper" },
    "@/components/events/scheduled-class-fields": { ScheduledClassFields: "schedule-fields" },
    "@/components/events/event-qualification-fields": { EventQualificationFields: "qualification-fields" },
    "@/app/(app)/events/actions": { createRoping() {} },
  };
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return props => { index = 0; return compiled.exports.CreateRopingDialog({ configured: true, divisions: [{ id: "template" }], incentiveClassifications: [], ...props }); };
}
test("event form uses protected dialog dismissal and prevents closing during a save", () => {
  for (const pending of [false, true]) {
    const tree = setup({ pending })();
    const shell = nodes(tree, node => node.type === "dialog-shell")[0];
    assert.equal(shell.props.busy, pending);
    assert.equal(shell.props.wide, true);
    const cancel = nodes(tree, node => node.type === "button" && node.props.children === "Cancel")[0];
    assert.ok("data-dialog-close" in cancel.props);
    assert.equal(cancel.props.onClick, undefined);
    assert.equal(cancel.props.disabled, pending);
  }
});
test("duplicating an event preserves all submitted details and copied schedule", () => {
  const initialValues = { sourceTitle: "Original", title: "New weekend", slug: "new-weekend", venueName: "Arena", address: "1 Main", city: "Stephenville", state: "TX", postalCode: "76401", arenaCount: 2, startsAt: "2026-10-17T09:00", endsAt: "2026-10-18T18:00", entriesOpenAt: "2026-10-15T09:00", entriesCloseAt: "2026-10-17T08:00", publicationState: "unpublished", eventFeeTitle: "Office", eventFeeAmount: "20.00", occurrences: [{ templateId: "template" }] };
  const tree = setup()({ initialValues });
  for (const name of ["title", "slug", "venueName", "address", "city", "state", "postalCode", "arenaCount", "startsAt", "endsAt", "entriesOpenAt", "entriesCloseAt", "publicationState", "eventFeeTitle", "eventFeeAmount"]) {
    const fields = nodes(tree, node => node.props?.name === name);
    assert.equal(fields.length, 1, name);
    assert.equal(fields[0].props.value ?? fields[0].props.defaultValue, initialValues[name], name);
  }
  assert.deepEqual(nodes(tree, node => node.type === "schedule-fields")[0].props.initialOccurrences, initialValues.occurrences);
});
test("visibility review follows the selected publication state and save failures stay announced", () => {
  const render = setup({ state: { message: "Could not save. Try again." } });
  let tree = render();
  assert.ok(nodes(tree, node => node.type === "p" && node.props.children === "This event will stay hidden from the public.").length);
  const select = nodes(tree, node => node.props?.name === "publicationState")[0];
  select.props.onChange({ target: { value: "published" } });
  tree = render();
  assert.ok(nodes(tree, node => node.type === "p" && node.props.children === "This event will be visible to the public.").length);
  assert.ok(nodes(tree, node => node.props?.role === "alert" && node.props.children === "Could not save. Try again.").length);
});
