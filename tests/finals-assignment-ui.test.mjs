import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function renderAssignments(status, canEdit = true) {
  let stateIndex = 0;
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL("../src/components/settings/finals-position-assignments.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
  }).outputText;
  const imports = (name) => {
    if (name === "react") return { ...React, useState: () => [stateIndex++ === 0 ? status : "", () => {}], useActionState: () => [{}, () => {}, false] };
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.endsWith("/assignment-actions")) return { assignFinalsPosition: () => {} };
    return (name === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(name));
  };
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  return renderToStaticMarkup(React.createElement(compiled.exports.FinalsPositionAssignments, { seasonId: "season", endsOn: "2027-04-30", canEdit,
    slots: [{ awardId: "award", number: 1, memberId: "member", classId: "11", source: "manual", targetId: null, status }],
    targets: [{ id: "target", classId: "11", name: "Finals #11 Tie-down", date: "2027-04-30", eventId: "event", ready: true, locked: false }],
    members: { member: "Alex Miller" }, classes: { 11: "#11 Tie-down" } }));
}
test("pending positions show matching scheduled targets and collapsed assignment controls", () => {
  const html = renderAssignments("pending");
  assert.match(html, /Pending assignment/);
  assert.match(html, /Finals #11 Tie-down/);
  assert.match(html, /Save assignment/);
  assert.doesNotMatch(html, /<details[^>]* open/);
});
test("expired positions remain visible without assignment controls", () => {
  const html = renderAssignments("expired");
  assert.match(html, /Expired/);
  assert.doesNotMatch(html, /Save assignment/);
});
test("read-only staff cannot assign pending positions", () => {
  assert.doesNotMatch(renderAssignments("pending", false), /Save assignment/);
});
