import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { matchesSearch } from "../src/lib/list-controls.ts";
const require = createRequire(import.meta.url);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const member = (id, status = "active") => ({ id, name: `Roper ${id}`, memberNumber: String(id), phone: "5551234567", email: "roper@example.com", status, joinedAt: "2026-01-01", classifications: [] });
function setup({ members = [member(1), member(2, "pending")], values = [], requireMemberships = true, initialStatus = "", capture = () => {} } = {}) {
  let index = 0; const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL("../src/components/members/member-list.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  const mocks = { react: { ...React, useId: () => "filters", useState: initial => { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], next => { values[slot] = next; }]; } }, "@/lib/list-controls": { matchesSearch }, papaparse: { default: { unparse: (rows, options) => { capture(rows, options); return "csv"; } } } };
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return { values, render() { index = 0; return compiled.exports.MemberList({ members, rows: members.map(item => React.createElement("tr", { key: item.id, "data-member-id": item.id })), head: null, requireMemberships, initialStatus }); } };
}
test("active filters remain clearable with the filter panel closed", () => {
  const h = setup({ values: ["", "pending", "", "name", false, 2] });
  const tree = h.render();
  assert.deepEqual(nodes(tree, node => node.props?.["data-member-id"]).map(node => node.props["data-member-id"]), [2]);
  assert.equal(nodes(tree, node => node.props?.id === "filters").length, 0);
  nodes(tree, node => node.type === "button" && node.props.children === "Clear filters")[0].props.onClick();
  assert.deepEqual(h.values.slice(0, 3), ["", "", ""]);
  assert.equal(h.values[5], 0);
  assert.equal(nodes(h.render(), node => node.props?.["data-member-id"]).length, 2);
});
test("roper-only mode ignores membership status deep links", () => {
  const h = setup({ requireMemberships: false, initialStatus: "pending" });
  const tree = h.render();
  assert.equal(h.values[1], "");
  assert.equal(h.values[4], false);
  assert.equal(nodes(tree, node => node.props?.["data-member-id"]).length, 2);
});
test("CSV includes all matching pages and keeps spreadsheet formula escaping", () => {
  const members = Array.from({ length: 31 }, (_, index) => member(index + 1));
  let exported, options, clicked = 0;
  const h = setup({ members, capture: (rows, settings) => { exported = rows; options = settings; } });
  const tree = h.render();
  assert.equal(nodes(tree, node => node.props?.["data-member-id"]).length, 25);
  const previousDocument = globalThis.document, create = URL.createObjectURL, revoke = URL.revokeObjectURL, timeout = globalThis.setTimeout;
  globalThis.document = { createElement: () => ({ click: () => clicked++ }) };
  URL.createObjectURL = () => "blob:test"; URL.revokeObjectURL = () => {}; globalThis.setTimeout = callback => { callback(); return 0; };
  try {
    nodes(tree, node => node.props?.["aria-label"] === "Export members")[0].props.onClick();
    assert.equal(exported.length, 31);
    assert.equal(options.escapeFormulae, true);
    assert.equal(clicked, 1);
  } finally { globalThis.document = previousDocument; URL.createObjectURL = create; URL.revokeObjectURL = revoke; globalThis.setTimeout = timeout; }
});

test("status deep links stay visible in the selector even with zero matches", () => {
  const h = setup({ members: [member(1)], initialStatus: "pending" });
  const tree = h.render();
  const select = nodes(tree, node => node.props?.["aria-label"] === "Membership status")[0];
  assert.equal(select.props.value, "pending");
  assert.ok(nodes(select, node => node.type === "option" && node.props.value === "pending").length);
  assert.equal(nodes(tree, node => node.props?.["data-member-id"]).length, 0);
});
