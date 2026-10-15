import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
test("event progress, visibility and result finality remain independent", () => {
  const { EventStatusOverview } = load("../src/components/events/event-status-overview.tsx", {
    "@/components/ui/status-pill": { StatusPill: ({ status }) => React.createElement("span", null, status) },
    "@/components/help/help-link": { HelpLink: () => null },
  });
  for (const status of ["scheduled", "in_progress", "completed", "cancelled"]) for (const publicationState of ["draft", "published", "unpublished"]) for (const resultStatus of ["unofficial", "official"]) {
    const html = renderToStaticMarkup(React.createElement(EventStatusOverview, { status, publicationState, resultStatus }));
    for (const label of ["Event progress", "Public visibility", "Results"]) assert.ok(html.includes(label));
    if (publicationState === "published") assert.match(html, /visible on your public page/);
    else assert.match(html, /hidden from your public page/);
    if (resultStatus === "official") assert.match(html, /Results have been finalized/);
    else assert.match(html, /Results are provisional/);
  }
});
test("visibility changes require explicit save and retain the publication readiness gate", () => {
  for (const current of ["draft", "published", "unpublished"]) for (const selected of ["draft", "published", "unpublished"]) for (const pending of [false, true]) {
    const { EventPublicationControl } = load("../src/components/events/event-publication-control.tsx", {
      react: { ...React, useId: () => "hint", useState: () => [selected, () => {}], useActionState: () => [{}, () => {}, pending] },
      "./setup-readiness-form": { SetupReadinessForm: "review-form" },
      "@/app/(app)/events/[eventId]/publication-actions": { updateEventPublication() {} },
    });
    const tree = EventPublicationControl({ eventId: "event", publicationState: current, enabled: true });
    assert.equal(tree.props.mode, selected === "published" && current !== "published" ? "publish" : null);
    assert.equal(nodes(tree, node => node.type === "button")[0].props.disabled, pending || current === selected);
    assert.equal(nodes(tree, node => node.type === "select")[0].props.disabled, pending);
    const text = nodes(tree, node => node.props?.id === "hint")[0].props.children;
    if (pending) assert.match(text, /Waiting for confirmation/);
    else if (selected !== current) assert.match(text, /Unsaved change.*Choose Save/);
  }
});
test("official results keep permissions, competition stage, and readiness checks", () => {
  for (const enabled of [false, true]) for (const status of ["scheduled", "in_progress", "completed"]) for (const ready of [false, true]) for (const pending of [false, true]) {
    let index = 0;
    const { EventOfficialResultsControl } = load("../src/components/events/event-official-results-control.tsx", {
      react: { ...React, useActionState: () => [{}, () => {}, pending], useState: () => [index++ === 0 ? true : ready, () => {}] },
      "@/components/ui/dialog": { Dialog: "protected-dialog" },
      "@/components/ui/persistent-form": { PersistentForm: "save-form" },
      "./final-readiness-check": { FinalReadinessCheck: "readiness" },
      "@/app/(app)/events/[eventId]/result-actions": { markEventResultsOfficial() {} },
    });
    const tree = EventOfficialResultsControl({ eventId: "event", enabled, status, resultStatus: "unofficial" });
    const dialogs = nodes(tree, node => node.type === "protected-dialog");
    if (!enabled || status === "scheduled") { assert.equal(dialogs.length, 0); continue; }
    assert.equal(dialogs[0].props.busy, pending);
    assert.match(dialogs[0].props.description, /Public visibility stays/);
    assert.equal(nodes(tree, node => node.type === "readiness").length, 1);
    const submit = nodes(tree, node => node.type === "button" && node.props.type === undefined)[0];
    assert.equal(submit.props.disabled, pending || !ready);
  }
});
