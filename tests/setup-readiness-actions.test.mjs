import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { setupReadiness } from "../src/lib/events/setup-readiness.ts";
import { payoutScheduleIssues } from "../src/lib/payout-schedule-validation.ts";
import { ropingDisplayName } from "../src/lib/events/roping-display-name.ts";

const require = createRequire(import.meta.url);
const eventId = "80efcae9-7b08-4250-82b4-3c4697c1dbe6";
function load({ allowed = true, failed = false, missingPlaces = false } = {}) {
  const reads = [];
  const rows = {
    events: { starts_at: "2026-10-10T05:00:00Z", ends_at: "2026-10-12T04:59:00Z" },
    event_ropings: [{ id: "r1", name: "Open", divisions: { name: "Tie-down" }, scheduled_date: "2026-10-11", arena_name: "Arena 1", sort_order: 1, schedule_type: "fixed", starts_at: "2026-10-11T14:00:00Z", short_round_enabled: false, competition_format: "standard", four_d_settings: null }],
    event_roping_payout_plans: [{ event_roping_id: "r1", name: "Main", pool_type: "main", go_rounds_basis_points: 10000, aggregate_basis_points: 0, short_round_basis_points: 0,
      event_roping_payout_brackets: [{ stage_type: "go_round", minimum_entries: 1, maximum_entries: null, event_roping_payout_places: missingPlaces ? [] : [{ place_number: 1, percentage_basis_points: 10000 }] }] }],
  };
  const db = {
    from(table) {
      const builder = { select() { return this; }, eq(field, value) { reads.push([table, field, value]); return this; }, order() { return this; }, single() { return this; }, then(resolve) { return Promise.resolve({ data: rows[table], error: failed ? { message: "failure" } : null }).then(resolve); } };
      return builder;
    },
    rpc: async () => ({ data: [], error: null }),
  };
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL("../src/app/(app)/events/[eventId]/setup-readiness-actions.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", code)((id) => ({
    "@/lib/producers": { getActiveProducer: async () => ({ id: "producer", timezone: "America/Chicago" }) },
    "@/lib/staff-access": { eventStaffAccess: async () => allowed },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/payout-schedule-validation": { payoutScheduleIssues },
    "@/lib/events/setup-readiness": { setupReadiness },
    "@/lib/events/roping-display-name": { ropingDisplayName },
  }[id] ?? require(id)), compiled.exports);
  return { run: compiled.exports.getSetupReadiness, reads };
}
test("server reads copied schedules and uses producer-local event dates", async () => {
  const { run, reads } = load();
  assert.deepEqual(await run(eventId, "start"), { issues: [] });
  for (const table of ["events", "event_ropings", "event_roping_payout_plans"]) assert.ok(reads.some(([t, field, value]) => t === table && field === "producer_id" && value === "producer"));
});
test("incomplete copied places block starting", async () => {
  const { run } = load({ missingPlaces: true });
  assert.equal((await run(eventId, "start")).issues[0].severity, "blocker");
});
test("unauthorized users cannot read readiness; failed reads cannot authorize continuation", async () => {
  const denied = load({ allowed: false });
  assert.ok((await denied.run(eventId, "start")).message);
  assert.equal(denied.reads.length, 0);
  assert.ok((await load({ failed: true }).run(eventId, "publish")).message);
});
