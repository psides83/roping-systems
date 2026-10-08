import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compareMoneyPools, moneySectionLabel } from "../src/lib/events/public-money-results.ts";
import { qualifiedTimeLabel } from "../src/lib/events/public-standings.ts";
import { formatAccountMoney } from "../src/lib/roper-accounts.ts";
import { formatEntryLabel } from "../src/lib/entry-labels.ts";
const require = createRequire(import.meta.url);
function load(path, mocks) {
  const loaded = { exports: {} };
  const source = transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)((id) => mocks[id] ?? require(id), loaded, loaded.exports);
  return loaded.exports;
}
const logic = load("lib/roper-results.ts", { "./events/public-money-results": { compareMoneyPools } });
const { PersonalResultsView } = load("components/roper/personal-results.tsx", {
  "@/lib/roper-results": logic, "@/lib/events/public-money-results": { moneySectionLabel },
  "@/lib/events/public-standings": { qualifiedTimeLabel }, "@/lib/entry-labels": { formatEntryLabel },
  "@/lib/roper-accounts": { formatAccountMoney }, "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
});
const award = (poolType, poolName, payoutCents) => ({ planId: poolType, poolType, poolName, payoutCents, sectionType: "aggregate", roundNumber: null, dNumber: null, place: 1 });
const entry = { id: "entry", number: 1, ropingId: "roping", ropingName: "#11.5", division: "Tie-down", date: "2026-10-08", mainRoundCount: 3, resultStatus: "official", competitionStatus: "active", eventTitle: "Fall Roping", eventSlug: "fall", public: false, paidCents: "5000",
  runs: [{ round: 1, status: "complete", time: "10.15" }, { round: 2, status: "no_time", time: null }, { round: 3, status: "complete", time: "12.30" }],
  awards: [award("insurance", "Insurance", "2000"), award("side_pot", "Side Pot", "3000"), award("main", "Main", "10000")] };
test("partial aggregate retains actual times and pool ordering", () => {
  const summary = logic.personalResultSummary(entry);
  assert.equal(summary.aggregate, 22.45); assert.equal(summary.qualifiedCount, 2);
  assert.deepEqual(summary.awards.map((a) => a.poolType), ["main", "side_pot", "insurance"]);
  assert.equal(summary.winningsCents, 15000); assert.equal(summary.remainingCents, 10000);
});
test("short-round total and main average remain distinct", () => {
  const summary = logic.personalResultSummary({ ...entry, runs: [...entry.runs, { round: 4, status: "complete", time: 9.25 }] });
  assert.equal(summary.mainAggregate, 22.45); assert.equal(summary.aggregate, 31.70);
});
test("no-time results remain null and unofficial amounts are not due", () => {
  assert.equal(logic.personalResultSummary({ ...entry, runs: [] }).aggregate, null);
  const totals = logic.personalResultsTotals([entry, { ...entry, resultStatus: "unofficial", paidCents: 0 }]);
  assert.equal(totals.officialCents, 15000); assert.equal(totals.provisionalCents, 15000); assert.equal(totals.remainingCents, 10000);
});
test("paid corrections cannot produce a negative amount remaining", () => {
  const summary = logic.personalResultSummary({ ...entry, paidCents: 20000 });
  assert.equal(summary.remainingCents, 0); assert.equal(summary.needsReconciliation, true);
});
test("personal result details are collapsed and private results have no public link", () => {
  const html = renderToStaticMarkup(React.createElement(PersonalResultsView, { data: { entries: [entry], seasons: [], total: 1, page: 1 }, membership: { producerSlug: "producer", entryLabelStyle: "letter" } }));
  assert.match(html, /22.45 · On two/); assert.match(html, /Entry A/); assert.doesNotMatch(html, /Full roping results/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.ok(html.indexOf("Main · Average") < html.indexOf("Side Pot · Average"));
});
