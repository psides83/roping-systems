import test from "node:test";
import assert from "node:assert/strict";
import { duesTotals, duesContribution, nonnegativeMoney } from "../src/lib/membership-dues.ts";
import { formatCurrencyExact } from "../src/lib/utils.ts";

test("dues and ledger money display retains cents", () => {
  assert.equal(formatCurrencyExact(1250), "$12.50");
  assert.equal(formatCurrencyExact(-1667), "-$16.67");
});

test("installment contributions sum to the exact allocation, including cent rounding", () => {
  const installments = [3333, 3333, 3334];
  let paid = 0, deposited = 0;
  for (const payment of installments) {
    const delta = duesContribution(paid + payment, 10000, 2500) - duesContribution(paid, 10000, 2500);
    deposited += delta; paid += payment;
  }
  assert.equal(deposited, 2500);
  assert.equal(duesContribution(5000, 10000, 5000), 2500);
  assert.equal(duesContribution(1, 10000, 5000), 1);
  assert.equal(duesContribution(2147483647, 2147483647, 2147483647), 2147483647);
  assert.throws(() => duesContribution(10001, 10000, 5000));
});
test("dues totals include payment reversals and keep retained dues separate from funds", () => {
  const account = { amount_cents: 10000, payments: [{ amount_cents: 5000, contributed_cents: 2500 }, { amount_cents: 5000, contributed_cents: 2500 }, { amount_cents: -5000, contributed_cents: -2500 }] };
  assert.deepEqual(duesTotals([account]), { charged: 10000, collected: 5000, outstanding: 5000, contributed: 2500, retained: 2500 });
  assert.deepEqual(duesTotals([]), { charged: 0, collected: 0, outstanding: 0, contributed: 0, retained: 0 });
});
test("dues inputs accept zero allocation and cents, rejecting negatives and excessive precision", () => {
  assert.equal(nonnegativeMoney("0.00"), 0);
  assert.equal(nonnegativeMoney("12.50"), 1250);
  for (const value of ["", "-5", "12.501", "NaN", "1e3", "21474836.48"]) assert.equal(nonnegativeMoney(value), null);
});
