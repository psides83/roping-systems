import assert from "node:assert/strict";
import test from "node:test";
import { payoutStage, payoutStatus, registerRopers } from "../src/lib/events/payout-register.ts";

const award = (values = {}) => ({
  planId: "main", ropingId: "roping", ropingName: "#11", poolName: "Main", poolType: "main",
  entryId: "entry", roperId: "roper", name: "Roper", memberNumber: "100", sectionType: "go_round",
  round: 1, dNumber: null, place: 1, awardKey: "award", amountCents: 1000, paidCents: 0, ...values,
});

test("register combines multiple entries, pools, and ropings by roper identity", () => {
  const [roper] = registerRopers([award(), award({ entryId: "second", amountCents: 500 }),
    award({ ropingId: "next", poolType: "side_pot", amountCents: 200 })]);
  assert.equal(roper.totalCents, 1700);
  assert.equal(roper.dueCents, 1700);
  assert.equal(roper.awards.length, 3);
  assert.equal(payoutStatus(roper), "Unpaid");
});

test("partial and full payments have separate statuses and exact balances", () => {
  const [partial] = registerRopers([award({ paidCents: 250 })]);
  assert.equal(partial.dueCents, 750);
  assert.equal(payoutStatus(partial), "Partially paid");
  assert.equal(payoutStatus(registerRopers([award({ paidCents: 1000 })])[0]), "Paid");
});

test("overpaid awards require review and do not offset other unpaid awards", () => {
  const [roper] = registerRopers([award({ paidCents: 1200 }), award({ amountCents: 500 })]);
  assert.equal(roper.dueCents, 500);
  assert.equal(payoutStatus(roper), "Needs review");
});

test("same names remain separate and a single-roping scope excludes other winnings", () => {
  const awards = [award(), award({ roperId: "other" }), award({ ropingId: "other-roping" })];
  assert.equal(registerRopers(awards).length, 2);
  assert.equal(registerRopers(awards.filter((row) => row.ropingId === "roping"))[0].totalCents, 1000);
});

test("award breakdowns label rounds, average, short round, and Ds", () => {
  assert.equal(payoutStage(award()), "Round 1");
  assert.equal(payoutStage(award({ sectionType: "aggregate" })), "Average");
  assert.equal(payoutStage(award({ sectionType: "short_round" })), "Short round");
  assert.equal(payoutStage(award({ dNumber: 4 })), "4D");
});
