import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { readAllRows } from "../src/lib/supabase/read-all-rows.ts";
import { reconciliationTotals } from "../src/lib/events/reconciliation.ts";

function loader({ allowed = true, failed = null } = {}) {
  const reads = [];
  const tables = {
    events: { id: "event", title: "Test" }, event_fee_collection_summary: [],
    event_payments: Array.from({ length: 501 }, () => ({ amount_cents: 100, voided_at: null })),
    payout_receipts: [], event_payout_register_awards: [], event_ropings: [], roping_funding: [], fund_transactions: [],
  };
  function query(table) {
    reads.push([table, "read"]);
    let first = 0, last = 499;
    return { select() { return this; }, eq(field, value) { reads.push([table, field, value]); return this; }, order() { return this; }, single() { return this; }, range(a, b) { first = a; last = b; reads.push([table, "range", a]); return this; },
      then(resolve) { return Promise.resolve({ data: Array.isArray(tables[table]) ? tables[table].slice(first, last + 1) : tables[table], error: table === failed ? { message: "Read failed" } : null }).then(resolve); } };
  }
  const db = { from: query, rpc(name, args) { reads.push([name, "args", args]); return query(name); } };
  const compiled = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL("../src/lib/events/reconciliation-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = { "server-only": {}, "@/lib/staff-access": { eventStaffAccess: async (event, permission) => { assert.equal(event, "event"); assert.equal(permission, "can_finance_event"); return allowed ? { producer: { id: "producer" }, supabase: db } : null; } }, "@/lib/supabase/read-all-rows": { readAllRows }, "./reconciliation": { reconciliationTotals } };
  new Function("require", "exports", code)((name) => mocks[name], compiled.exports);
  return { run: () => compiled.exports.loadEventReconciliation("event"), reads };
}
test("finance permission is checked before reading report data", async () => {
  const { run, reads } = loader({ allowed: false });
  assert.equal(await run(), null);
  assert.equal(reads.length, 0);
});
test("report reads scope every table to producer and event, and paginate payments", async () => {
  const { run, reads } = loader();
  assert.equal((await run()).totals.recorded, 50100);
  for (const table of ["events", "event_payments", "payout_receipts", "event_ropings", "roping_funding", "fund_transactions"]) {
    assert.ok(reads.some(([t, field, value]) => t === table && field === "producer_id" && value === "producer"));
    assert.ok(reads.some(([t, field, value]) => t === table && ["id", "event_id", "event_ropings.event_id"].includes(field) && value === "event"));
  }
  assert.ok(reads.some(([table, field, value]) => table === "event_payments" && field === "range" && value === 500));
});
test("failed financial reads never appear as zero balances", async () => {
  await assert.rejects(loader({ failed: "fund_transactions" }).run(), /Load fund transfers/);
  await assert.rejects(loader({ failed: "event_payments" }).run(), /Load payments/);
});
