import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateEntryBalance } from "../src/lib/entry-balance.ts";
import { formatEntryLabel } from "../src/lib/entry-labels.ts";
import { formatAccountMoney } from "../src/lib/roper-accounts.ts";

const require = createRequire(import.meta.url);
function component(file, name) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(`../src/components/roper/${file}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", source)((path) => {
    if (path.endsWith("entry-balance")) return { calculateEntryBalance };
    if (path.endsWith("entry-labels")) return { formatEntryLabel };
    if (path.endsWith("roper-accounts")) return { formatAccountMoney };
    if (path.endsWith("status-pill")) return { StatusPill: ({ status }) => React.createElement("span", null, status) };
    if (path.endsWith("online-entry-request-actions")) return { OnlineEntryRequestActions: () => React.createElement("button", null, "Edit request") };
    return require(path);
  }, compiled, compiled.exports);
  return compiled.exports[name];
}
const Balances = component("portal-balances", "PortalBalances");
const Submissions = component("portal-submissions", "PortalSubmissions");
test("balance details start collapsed and retain cents, office charge and voided history", () => {
  const html = renderToStaticMarkup(React.createElement(Balances, { style: "letter", timezone: "America/Chicago", events: [{
    id: "event", title: "Fall Roping", startsAt: "2026-10-07T12:00:00Z",
    entries: [{ id: "entry", name: "Open", division: "Breakaway", number: 2, competitionStatus: "active", paymentStatus: "unpaid" }],
    charges: [{ id: "base", entryId: "entry", title: "Jackpot", amountCents: 30001, waived: false }, { id: "office", entryId: null, title: "Office", amountCents: 2000, waived: false }],
    payments: [{ id: "receipt", amountCents: 10000, voided: true, method: "cash", receivedAt: "2026-10-07T12:00:00Z" }],
  }] }));
  assert.match(html, /\$320\.01/);
  assert.match(html, /Once per event/);
  assert.match(html, /Entry B/);
  assert.match(html, /Voided/);
  assert.doesNotMatch(html, /<details[^>]* open/);
});
test("online requests distinguish pending from confirmed entries and charges", () => {
  const html = renderToStaticMarkup(React.createElement(Submissions, { timezone: "America/Chicago", submissions: [{ id: "request", status: "pending", submittedAt: "2026-10-07T12:00:00Z", eventTitle: "Fall Roping", items: [{ name: "Open", division: "Breakaway", date: "2026-10-10", quantity: 2 }] }] }));
  assert.match(html, /not confirmed entries or charges yet/);
  assert.match(html, /2 entries/);
  assert.match(html, /Open · Breakaway/);
});
test("payment and submission views have usable empty states", () => {
  assert.match(renderToStaticMarkup(React.createElement(Balances, { events: [], style: "number", timezone: "UTC" })), /No event charges or payments yet/);
  assert.match(renderToStaticMarkup(React.createElement(Submissions, { submissions: [], timezone: "UTC" })), /No linked online entry requests yet/);
});

test("only owned pending requests inside the change window expose editing", () => {
  const request = { id: "request", revision: 2, canModify: true, producerSlug: "producer", eventSlug: "event", status: "pending", submittedAt: "2026-10-07T12:00:00Z", eventTitle: "Fall Roping", items: [], changes: [{ action: "edited", changedAt: "2026-10-07T13:00:00Z" }] };
  const render = (overrides) => renderToStaticMarkup(React.createElement(Submissions, { timezone: "UTC", submissions: [{ ...request, ...overrides }] }));
  assert.match(render({}), /Edit request/);
  assert.match(render({}), /Selections updated/);
  assert.doesNotMatch(render({ status: "accepted" }), /Edit request/);
  assert.doesNotMatch(render({ status: "withdrawn" }), /Edit request/);
  assert.match(render({ status: "withdrawn" }), /cannot be accepted/);
  assert.match(render({ canModify: false }), /Changes are closed/);
  assert.doesNotMatch(render({ canModify: false }), /Edit request/);
  assert.doesNotMatch(render({ revision: undefined }), /Edit request/);
});

test("reviewed requests show the producer response without private office notes", () => {
  const html = renderToStaticMarkup(React.createElement(Submissions, { timezone: "UTC", submissions: [{
    id: "request", status: "declined", submittedAt: "2026-10-07T12:00:00Z", reviewedAt: "2026-10-08T12:00:00Z", eventTitle: "Fall Roping", items: [],
    producerResponse: "Please renew your membership. <script>unsafe</script>", reviewNote: "Private office note",
  }] }));
  assert.match(html, /Message from the producer/);
  assert.match(html, /Please renew your membership/);
  assert.match(html, /Reviewed/);
  assert.doesNotMatch(html, /Private office note|<script>/);
});
