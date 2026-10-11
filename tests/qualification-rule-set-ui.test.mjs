import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { qualificationCutoffText } from "../src/lib/qualification-rule-sets.ts";

const require = createRequire(import.meta.url);
const rule = { id: "rule", name: "Finals", season_id: "season", minimum_ropings: 10, top_places: 15, requirement_match: "any", cutoff_on: null };
function renderAssignment(ropingId) {
  const states = [true, { eventRuleId: "rule", mode: "inherit", ruleId: null, rules: [rule] }, ropingId ? "inherit" : "custom", "rule", ""];
  const compiled = { exports: {} };
  const source = readFileSync(new URL("../src/components/events/qualification-assignment-dialog.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    if (name === "react") return { ...React, useState: () => [states.shift(), () => {}], useTransition: () => [false, () => {}] };
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name.includes("rule-set-actions")) return {};
    if (name.endsWith("qualification-rule-sets")) return { qualificationCutoffText };
    return (name === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(name));
  }, compiled, compiled.exports);
  return renderToStaticMarkup(React.createElement(compiled.exports.QualificationAssignmentDialog, { eventId: "event", ropingId, editable: true }));
}

test("event qualification has an explicit toggle and reusable rule selector", () => {
  const html = renderAssignment();
  assert.match(html, /Requires qualification/);
  assert.match(html, /Qualification rule set/);
  assert.match(html, /10 ropings attended AND|10 ropings attended OR/);
  assert.doesNotMatch(html, /Use different rules/);
});

test("roping qualification presents inheritance, opt-out, and custom choices", () => {
  const html = renderAssignment("roping");
  assert.match(html, /Use event rules/);
  assert.match(html, /No qualification required/);
  assert.match(html, /Use different rules/);
  assert.match(html, /Event rules: Finals/);
});
