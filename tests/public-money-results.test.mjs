import assert from "node:assert/strict";
import test from "node:test";
import { compareMoneyPools, moneyWinnerRanking, moneySectionLabel } from "../src/lib/events/public-money-results.ts";

const award = (values = {}) => ({
  ropingId: "roping", planId: "main", poolName: "Main", poolType: "main",
  sectionType: "round", roundNumber: 1, dNumber: null, place: 1,
  entryId: "entry", roperId: "roper", name: "Roper", time: 10, payoutCents: 100,
  ...values,
});

test("winnings list main pot, side pot, then insurance side pot", () => {
  const pools = [
    award({ poolName: "Insurance Side Pot", poolType: "side_pot" }),
    award({ poolName: "Side Pot", poolType: "side_pot" }),
    award(),
    award({ poolName: "Coverage", poolType: "insurance" }),
  ].sort(compareMoneyPools);
  assert.deepEqual(pools.map((pool) => pool.poolName), ["Main", "Side Pot", "Coverage", "Insurance Side Pot"]);
});

test("total winnings combine multiple entries, rounds, and optional pots by roper identity", () => {
  const [winner] = moneyWinnerRanking([
    award(), award({ entryId: "second-entry", roundNumber: 2, payoutCents: 200 }),
    award({ planId: "side", poolType: "side_pot", payoutCents: 50 }),
    award({ planId: "insurance", poolType: "side_pot", sectionType: "aggregate", payoutCents: 75 }),
  ]);
  assert.equal(winner.mainCents, 300);
  assert.equal(winner.sideCents, 125);
  assert.equal(winner.totalCents, 425);
});

test("same-named ropers stay separate and tied totals share rank", () => {
  const winners = moneyWinnerRanking([
    award({ roperId: "a", payoutCents: 200 }), award({ roperId: "b", payoutCents: 200 }),
    award({ roperId: "c", payoutCents: 100 }), award({ roperId: "d", payoutCents: 0 }),
  ]);
  assert.deepEqual(winners.map((winner) => winner.place), [1, 1, 3]);
  assert.equal(winners.length, 3);
});

test("section names distinguish main rounds, average, short round, and 4D", () => {
  assert.equal(moneySectionLabel(award()), "Round 1");
  assert.equal(moneySectionLabel(award({ sectionType: "aggregate" })), "Average");
  assert.equal(moneySectionLabel(award({ sectionType: "short_round" })), "Short round");
  assert.equal(moneySectionLabel(award({ dNumber: 3 })), "3D");
});
