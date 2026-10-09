import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(fs.readFileSync(new URL("../src/lib/member-activity-data.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(role, member = { id: "m", roper_id: "r" }) {
  const calls = [];
  let financialReads = 0;
  let qualificationReads = 0;
  const db = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const chain = { select() { return chain; }, eq(key, value) { call.filters.push([key, value]); return chain; },
      order() { return chain; }, range() { return Promise.resolve({ data: [], error: null }); },
      maybeSingle() { return Promise.resolve({ data: member, error: null }); } };
    return chain;
  } };
  const modules = {
    "server-only": {}, "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/producers": { getActiveProducer: async () => role ? { id: "p", slug: "producer", role, timezone: "UTC" } : null },
    "@/lib/supabase/read-all-rows": { readAllRows: async callback => (await callback(0, 499)).data },
    "@/lib/member-activity": { activityMoney: () => "$0", memberActivityPage: () => ({ items: [] }) },
    "@/lib/member-qualification-activity": { loadMemberQualificationActivity: async () => { qualificationReads++; return []; } },
    "@/lib/member-financial-activity": { loadMemberFinancialActivity: async () => { financialReads++; return []; } },
    "@/lib/member-entry-activity": { loadMemberEntryChanges: async () => [] },
    "@/lib/entry-labels": {}, "@/lib/scoring": {}, "@/lib/events/public-standings": {},
  };
  const exports = {};
  new Function("require", "exports", code)(name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`);
    return modules[name];
  }, exports);
  return { load: exports.loadMemberActivity, calls, financialReads: () => financialReads, qualificationReads: () => qualificationReads };
}
test("member activity requires a verified active producer", async () => {
  const data = fixture(null);
  assert.equal(await data.load("m"), null);
  assert.equal(data.calls.length, 0);
});
test("a missing or foreign producer membership stops before history reads", async () => {
  const data = fixture("owner", null);
  assert.equal(await data.load("foreign"), null);
  assert.deepEqual(data.calls, [{ table: "memberships", filters: [["producer_id", "p"], ["id", "foreign"]] }]);
});
test("viewer activity does not fetch staff-only or financial sources", async () => {
  const data = fixture("viewer");
  await data.load("m");
  assert.equal(data.financialReads(), 0);
  assert.equal(data.qualificationReads(), 0);
  assert.deepEqual(data.calls.map(call => call.table), ["memberships", "producer_seasons", "roping_entries"]);
  assert.ok(data.calls.every(call => call.filters.some(([key, value]) => key === "producer_id" && value === "p")));
});
test("managers receive the authorized financial and qualification sources", async () => {
  const data = fixture("owner");
  await data.load("m");
  assert.equal(data.financialReads(), 1);
  assert.equal(data.qualificationReads(), 1);
  assert.ok(data.calls.every(call => call.filters.some(([key, value]) => key === "producer_id" && value === "p")));
});
