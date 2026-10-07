import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatEntryLabel } from "../src/lib/entry-labels.ts";
import { portalResultsLink } from "../src/lib/roper-portal.ts";

const require = createRequire(import.meta.url);
const compiled = { exports: {} };
const source = transpileModule(readFileSync(new URL("../src/components/roper/portal-entries.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
}).outputText;
new Function("require", "module", "exports", source)((name) => {
  if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
  if (name.endsWith("status-pill")) return { StatusPill: ({ status }) => React.createElement("span", null, status) };
  if (name.endsWith("entry-labels")) return { formatEntryLabel };
  if (name.endsWith("roper-portal")) return { portalResultsLink };
  return require(name);
}, compiled, compiled.exports);

function render(entries, history = false) {
  return renderToStaticMarkup(React.createElement(compiled.exports.PortalEntries, { entries, history, membership: { producerSlug: "producer", entryLabelStyle: "letter" } }));
}
test("portal entries use producer labels, division context, and private-event link guards", () => {
  const row = { id: "entry", number: 2, ropingName: "Open", division: "Breakaway", date: "2026-10-07", eventTitle: "Fall Roping", status: "completed", competitionStatus: "active", paymentStatus: "paid_cash", public: false };
  const html = render([row]);
  assert.match(html, /Open · Breakaway/);
  assert.match(html, /Entry B/);
  assert.match(html, /paid_cash/);
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /flex-wrap/);
});
test("portal has distinct empty states for upcoming entries and history", () => {
  assert.match(render([]), /No upcoming entries/);
  assert.match(render([], true), /No past entries yet/);
});
