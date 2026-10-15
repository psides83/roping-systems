import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? (name.startsWith("@/") ? new Proxy({}, { get: (_, key) => key === "__esModule" ? true : key }) : require(name)), compiled, compiled.exports);
  return compiled.exports;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const slot = extra => ({ awardId: "award", number: 1, memberId: "member", classId: "open", source: "finish", targetId: null, status: "pending", ...extra });
function view({ slots = [slot({})], targets = [], canEdit = true, values = ["pending", ""] } = {}) {
  let index = 0;
  const { FinalsPositionAssignments } = load("../src/components/settings/finals-position-assignments.tsx", { react: { ...React, useState: () => { const position = index++; return [values[position], next => { values[position] = next; }]; }, useActionState: () => [{}, () => {}, false] }, "next/link": { default: "a" } });
  return { values, tree: FinalsPositionAssignments({ slots, targets, canEdit, members: { member: "Jace" }, classes: { open: "Open" }, seasonId: "season", endsOn: "2026-12-31" }) };
}
test("assignment filters can recover to all positions and preserve status counts", () => {
  const h = view({ slots: [slot({ status: "assigned", targetId: "target" })], values: ["pending", "  jace  "] });
  assert.equal(nodes(h.tree, node => node.type?.name === "PositionForm").length, 0);
  nodes(h.tree, node => node.type === "button" && node.props.children === "Show all positions")[0].props.onClick();
  assert.deepEqual(h.values, ["all", ""]);
  const assigned = nodes(h.tree, node => node.type === "button" && node.props["aria-pressed"] === false).find(node => node.props.children?.includes("Assigned"));
  assigned.props.onClick(); assert.equal(h.values[0], "assigned");
});
test("viewers, expired positions and locked targets have no assignment form", () => {
  for (const props of [{ canEdit: false }, { slots: [slot({ status: "expired" })], values: ["all", ""] }, { slots: [slot({ targetId: "locked", status: "assigned" })], targets: [{ id: "locked", locked: true }], values: ["all", ""] }]) {
    assert.equal(nodes(view(props).tree, node => node.type?.name === "PositionForm").length, 0);
  }
});
test("assignment targets keep class, readiness, and lock restrictions", () => {
  const targets = [{ id: "ready", classId: "open", locked: false, ready: true }, { id: "setup", classId: "open", locked: false, ready: false }, { id: "locked", classId: "open", locked: true, ready: true }, { id: "other", classId: "other", locked: false, ready: true }];
  const form = nodes(view({ targets }).tree, node => node.type?.name === "PositionForm")[0];
  const tree = form.type(form.props);
  const select = nodes(tree, node => node.props?.name === "targetId")[0];
  const options = nodes(select, node => node.type === "option");
  assert.deepEqual(options.map(node => node.props.value), ["", "ready", "setup"]);
  assert.equal(options[2].props.disabled, true);
  assert.equal(nodes(tree, node => node.props?.name === "reason")[0].props.required, true);
});
test("retired standings settings redirects to unified qualification rules", () => {
 let destination;
 const { default: Page } = load("../src/app/(app)/settings/standings/page.tsx", { "next/navigation": {redirect: value => {destination=value;}} });
 Page(); assert.equal(destination,"/settings/qualifications");
});
