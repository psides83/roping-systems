import { test } from "node:test";
import assert from "node:assert/strict";
import { feeCollectionTotals, payoutSummary } from "../src/lib/events/fee-collections.ts";

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
