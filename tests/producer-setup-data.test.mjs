import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { producerSetupChecklist } from "../src/lib/producer-setup.ts";
import { payoutScheduleIssues } from "../src/lib/payout-schedule-validation.ts";
import { seasonCalendarDate } from "../src/lib/seasons.ts";
import { readAllRows } from "../src/lib/supabase/read-all-rows.ts";

function loader({ missingProducer = false, failedTable = null, preview = false } = {}) {
  const reads = [];
  const classes = Array.from({ length: 501 }, (_, index) => ({ id: `class-${index}`, division_id: "td", is_active: true, standalone_enabled: true, handicap_adjustment_seconds: 0 }));
  const tables = {
    divisions: [{ id: "td", name: "Tie-down", is_active: true }], classifications: classes,
    roping_templates: [{ id: "t", name: "Handicap", division_id: "td", is_active: true, competition_format: "handicap", payout_schedule_id: "p", short_round_enabled: false, handicap_rules: [{ classificationId: "class-500" }], roping_template_fees: [] }],
    payout_schedules: [{ id: "p", name: "Payouts", is_active: true, competition_format: "standard", go_rounds_basis_points: 10000, aggregate_basis_points: 0, short_round_basis_points: 0, short_round_enabled: false, four_d_settings: null,
      payout_schedule_brackets: [{ stage_type: "go_round", minimum_entries: 1, maximum_entries: null, payout_schedule_places: [{ place_number: 1, percentage_basis_points: 10000 }] }] }],
    producer_seasons: [{ id: "s", name: "Long season", starts_on: "2000-01-01", ends_on: "2100-12-31" }],
    producer_funds: [], qualification_rule_sets: [], producer_dues_settings: null,
  };
  const db = { from(table) {
    let bounds = [0, 499];
    const query = { select() { return this; }, eq(field, value) { reads.push([table, field, value]); return this; }, order() { return this; }, range(first, last) { bounds = [first, last]; reads.push([table, "range", bounds]); return this; }, maybeSingle() { return this; },
      then(resolve) { return Promise.resolve({ data: Array.isArray(tables[table]) ? tables[table].slice(bounds[0], bounds[1] + 1) : tables[table], error: table === failedTable ? { message: "connection lost" } : null }).then(resolve); },
    }; return query;
  } };
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL("../src/lib/producer-setup-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    "server-only": {}, "@/lib/producers": { getActiveProducer: async () => missingProducer ? null : ({ id: "producer", name: "Test producer", role: "viewer", timezone: "America/Chicago" }) },
    "@/lib/supabase/config": { isSupabaseConfigured: () => !preview }, "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/read-all-rows": { readAllRows }, "@/lib/payout-schedule-validation": { payoutScheduleIssues },
    "@/lib/producer-setup": { producerSetupChecklist }, "@/lib/seasons": { seasonCalendarDate },
  };
  new Function("require", "exports", code)((id) => { if (!(id in mocks)) throw new Error(`Unexpected dependency ${id}`); return mocks[id]; }, compiled.exports);
  return { run: compiled.exports.loadProducerSetup, reads };
}
test("every setup read is scoped to the active producer; classification pagination reaches the last page", async () => {
  const { run, reads } = loader();
  const result = await run();
  for (const table of ["divisions", "classifications", "roping_templates", "payout_schedules", "producer_seasons", "producer_funds", "qualification_rule_sets", "producer_dues_settings"]) assert.ok(reads.some(([t, field, value]) => t === table && field === "producer_id" && value === "producer"));
  assert.ok(reads.some(([table, field, range]) => table === "classifications" && field === "range" && range[0] === 500));
  assert.equal(result.items.find((item) => item.id === "templates").status, "ready");
  assert.equal(result.role, "viewer");
});
test("failed reads never become a misleading ready or empty checklist", async () => {
  await assert.rejects(loader({ failedTable: "payout_schedules" }).run(), /Unable to check payout schedules/);
  await assert.rejects(loader({ failedTable: "producer_dues_settings" }).run(), /Unable to check membership dues/);
});
test("no active producer is an error, not another producer's data", async () => {
  const { run, reads } = loader({ missingProducer: true });
  await assert.rejects(run(), /Select a producer/);
  assert.equal(reads.length, 0);
});
test("unconnected preview uses no database reads and makes no claims of ready setup", async () => {
  const { run, reads } = loader({ preview: true });
  const result = await run();
  assert.equal(result.configured, false);
  assert.equal(reads.length, 0);
  assert.ok(result.items.some((item) => item.status === "attention"));
});
