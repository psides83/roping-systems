import { test } from "node:test";
import assert from "node:assert/strict";
import { feeCollectionTotals, feeCollectionCategory, feeCollectionAllocations, payoutSummary } from "../src/lib/events/fee-collections.ts";

test("practice receipts share the production and office fee category without changing payout pots", () => {
  const fees = [
    { kind: "standard", contributes_to_payout: false, collected_cents: 10000 },
    { kind: "standard", contributes_to_payout: false, collected_cents: 2000 },
    { kind: "stock_charge_run", contributes_to_payout: false, collected_cents: 12500 },
    { kind: "stock_charge_score", contributes_to_payout: false, collected_cents: 1500 },
    { kind: "standard", contributes_to_payout: true, collected_cents: 30000 },
    { kind: "added_money", contributes_to_payout: false, collected_cents: 1000 },
  ];
  assert.ok(fees.slice(0,4).every(fee => feeCollectionCategory(fee) === "nonPayoutFees"));
  assert.deepEqual(feeCollectionAllocations(fees), { nonPayoutFees: 26000, payoutFees: 30000, fundContributions: 1000 });
});

test("fee card totals combine entry and event charges and handle database integer strings", () => {
  assert.deepEqual(feeCollectionTotals([
    { collected_cents: "30015", outstanding_cents: "5000" },
    { collected_cents: 2000, outstanding_cents: 0 },
  ]), { collectedCents: 32015, outstandingCents: 5000 });
  assert.deepEqual(feeCollectionTotals([]), { collectedCents: 0, outstandingCents: 0 });
});
test("payout card keeps awarded and paid amounts distinct and does not show a negative remaining balance", () => {
  assert.deepEqual(payoutSummary(14891025, 2500), { dueCents: 14891025, completedCents: 2500, remainingCents: 14888525 });
  assert.deepEqual(payoutSummary(2500, 2500), { dueCents: 2500, completedCents: 2500, remainingCents: 0 });
  assert.equal(payoutSummary(2500, 3000).remainingCents, 0);
});
