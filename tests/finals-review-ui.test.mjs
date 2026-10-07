import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as eligibility from "../src/lib/finals-entry-eligibility.ts";
import * as standings from "../src/lib/season-standings.ts";

const require = createRequire(import.meta.url);
function compile(path, imports) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  return compiled.exports;
}
const review = compile("../src/lib/finals-entry-review.ts", () => eligibility);

async function renderReview({ manager = true, configured = true, current = false } = {}) {
  const data = {
    event_ropings: { name: "#11", classification_id: "class", division_id: "division", competition_format: "standard", max_entries_per_roper: 1, event_day_status: "scheduled", events: { status: "scheduled" }, divisions: { name: "Tie-down" } },
    roping_qualification_checks: configured ? { season_id: "season", class_key: "class", bonus_entries_enabled: true, source_revision: current ? 2 : 1, rule_updated_at: "2026-10-07T09:00:00Z", checked_at: "2026-10-07T09:00:00Z" } : null,
    producer_seasons: { name: "2026 season", starts_on: "2026-05-01", ends_on: "2027-04-30" },
    standings_qualification_rules: { top_places: 10, minimum_ropings: 5, cutoff_on: null, earned_position_policy: "rank", updated_at: "2026-10-07T09:00:00Z" },
    producers: { standings_revision: 2 },
  };
  const db = { rpc: async () => ({ data: manager }), from: (table) => {
    const result = { data: data[table], error: null };
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => result, single: async () => result };
    return chain;
  } };
  const entries = [{ id: "entry-1", roper_id: "roper", eligibility_overridden: false, ropers: { first_name: "Alex", last_name: "Miller" } },
    { id: "entry-2", roper_id: "other", eligibility_overridden: false, ropers: { first_name: "Casey", last_name: "Baker" } }];
  const imports = (name) => {
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (name === "next/navigation") return { notFound: () => { throw new Error("Not found"); } };
    if (name.endsWith("/producers")) return { getActiveProducer: async () => ({ id: "producer", slug: "test", timezone: "America/Chicago" }) };
    if (name.endsWith("/supabase/server")) return { createClient: async () => db };
    if (name.endsWith("/read-all-rows")) return { readAllRows: async () => entries };
    if (name.endsWith("/season-standings-data")) return { loadSeasonStandings: async () => ({ contributions: Array.from({ length: 5 }, (_, i) => ({ roperId: "roper", classId: "class", ropingId: `roping-${i}`, date: "2026-06-01", official: true, winningsCents: 100 })), moves: [], ropers: [{ roperId: "roper", classId: "class", name: "Alex Miller", city: "Hamilton", state: "TX" }] }) };
    if (name.endsWith("/season-standings")) return standings;
    if (name.endsWith("/finals-entry-eligibility")) return eligibility;
    if (name.endsWith("/finals-entry-review")) return review;
    if (name.endsWith("/finals-qualification-data")) return { loadFinalsQualifications: async () => ({ totals: [{ memberId: "member", classId: "class", positions: 2 }], profiles: [{ memberId: "member", roperId: "roper", name: "Alex Miller" }] }) };
    if (name.endsWith("/qualification-notice")) return { qualificationNoticeText: () => "Top 10, five ropings required" };
    if (name.endsWith("/utils")) return { formatCurrency: (cents) => `$${cents / 100}` };
    if (name.endsWith("/roping-qualification-dialog")) return { RopingQualificationDialog: () => React.createElement("button", null, "Qualification setup") };
    if (name.endsWith("/qualification-refresh-button")) return { QualificationRefreshButton: () => React.createElement("button", null, "Refresh check") };
    return require(name);
  };
  const page = compile("../src/app/(app)/events/[eventId]/qualification/[ropingId]/page.tsx", imports).default;
  return renderToStaticMarkup(await page({ params: Promise.resolve({ eventId: "event", ropingId: "roping" }), searchParams: Promise.resolve({}) }));
}

test("finals entry review renders capacity, warnings, navigation, and compact filters", async () => {
  const html = await renderReview();
  assert.match(html, /#11 Tie-down/);
  assert.match(html, /2 available/);
  assert.match(html, /2 bonus/);
  assert.match(html, /Accepted entries need review/);
  assert.match(html, /Refresh check/);
  assert.match(html, /Needs refresh/);
  assert.match(html, /Manage entries/);
  assert.match(html, /Accepted entries needing review/);
});

test("read-only review omits manager controls and reports a current check", async () => {
  const html = await renderReview({ manager: false, current: true });
  assert.doesNotMatch(html, /Refresh check|Qualification setup|Needs refresh/);
  assert.match(html, /Current/);
});

test("unconfigured finals review offers setup instead of an empty standings table", async () => {
  const html = await renderReview({ configured: false });
  assert.match(html, /no qualification requirements/);
  assert.match(html, /Qualification setup/);
  assert.doesNotMatch(html, /<table/);
});
