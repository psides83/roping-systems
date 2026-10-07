import test from "node:test";
import assert from "node:assert/strict";
import { calculateEntryBalance } from "../src/lib/entry-balance.ts";
const entry = (id, paymentStatus = "unpaid", competitionStatus = "active") => ({ id, paymentStatus, competitionStatus });
const charge = (entryId, amountCents, waived = false) => ({ entryId, amountCents, waived });
test("event office fees count once alongside actual selected pot charges", () => {
  const balance = calculateEntryBalance([entry("a"), entry("b")], [charge("a", 30000), charge("a", 5000), charge("b", 30000), charge(null, 2000)], [{ amountCents: 10000, voided: false }]);
  assert.equal(balance.amountDueCents, 67000);
  assert.equal(balance.balanceDueCents, 57000);
});
test("waived, withdrawn, comped and refunded charges are not payable", () => {
  const balance = calculateEntryBalance([entry("a"), entry("b", "comped"), entry("c", "refunded"), entry("d", "unpaid", "withdrawn")], [charge("a", 30000), charge("a", 5000, true), charge("b", 30000), charge("c", 30000), charge("d", 30000), charge(null, 2000)], []);
  assert.equal(balance.balanceDueCents, 32000);
  assert.equal(balance.billable(charge("d", 100)), false);
  assert.equal(calculateEntryBalance([entry("a", "comped")], [charge(null, 2000)], []).balanceDueCents, 0);
});
test("paid markers remain distinct from receipts; partial and void payments preserve balances", () => {
  const entries = [entry("a", "paid_cash")], charges = [charge("a", 30001)];
  const marked = calculateEntryBalance(entries, charges, []);
  assert.equal(marked.markedPaid, true);
  assert.equal(marked.amountPaidCents, 30001);
  assert.equal(marked.recordedPaymentCents, 0);
  const partial = calculateEntryBalance(entries, charges, [{ amountCents: 10000, voided: false }, { amountCents: 20000, voided: true }]);
  assert.equal(partial.markedPaid, false);
  assert.equal(partial.balanceDueCents, 20001);
});
test("credit is retained without becoming a negative amount due", () => {
  const balance = calculateEntryBalance([], [], [{ amountCents: 2000, voided: false }]);
  assert.equal(balance.balanceDueCents, 0);
  assert.equal(balance.creditCents, 2000);
});
