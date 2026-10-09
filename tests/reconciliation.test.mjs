import test from "node:test";
import assert from "node:assert/strict";
import { reconciliationTotals } from "../src/lib/events/reconciliation.ts";

test("paid flags remain distinct from receipts and finalized awards from provisional winnings", () => {
  const result = reconciliationTotals(
    [{ title: "Jackpot", assessed_cents: "10000", collected_cents: "8000", waived_cents: "500", outstanding_cents: "2000" }],
    [{ amount_cents: 3000, voided_at: null }, { amount_cents: 9000, voided_at: "reversed" }],
    [{ amount_cents: 1000, reversed_at: null, receipt_confirmed: false }, { amount_cents: 10000, reversed_at: "reversed", receipt_confirmed: true }],
    [{ event_roping_id: "final", payout_cents: "6000", paid_cents: "1500" }, { event_roping_id: "draft", payout_cents: "2000", paid_cents: "0" }], new Set(["final"]),
  );
  assert.equal(result.recorded, 3000);
  assert.equal(result.collectionDifference, 5000);
  assert.equal(result.finalizedAwards, 6000);
  assert.equal(result.awarded, 8000);
  assert.equal(result.paid, 1000);
  assert.equal(result.payoutDifference, 500);
  assert.equal(result.unconfirmed, 1000);
  assert.equal(result.remainingAwards, 6500);
});
test("refunds and unapplied credit are not silently clamped or hidden", () => {
  const result = reconciliationTotals([{ title: "Fee", assessed_cents: 1000, collected_cents: 1000, waived_cents: 0, outstanding_cents: 0 }],
    [{ amount_cents: 2000, voided_at: null }, { amount_cents: -500, voided_at: null }], [], [], new Set());
  assert.equal(result.recorded, 1500);
  assert.equal(result.collectionDifference, -500);
});
test("changed paid awards require review without negative remaining winnings", () => {
  const result = reconciliationTotals([], [], [], [{ event_roping_id: "r", payout_cents: 500, paid_cents: 1000 }], new Set());
  assert.equal(result.changedAwards, 1);
  assert.equal(result.remainingAwards, 0);
  assert.equal(result.payoutDifference, 1000);
});
test("an empty event has zero totals", () => {
  const result = reconciliationTotals([], [], [], [], new Set());
  assert.ok(Object.values(result).every((value) => value === 0));
});
