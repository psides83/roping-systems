import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOnlineEntryOptions } from "../src/lib/online-entry-summary.ts";

const ropings = [
  { id: "one", name: "#11 Tie-down", options: [{ id: "side", title: "Side Pot", amountCents: 5000, scope: "entry" }, { id: "office", title: "Office", amountCents: 2000, scope: "contestant_event" }] },
  { id: "two", name: "Open Breakaway", options: [{ id: "office", title: "Office", amountCents: 2000, scope: "contestant_event" }] },
];

test("unselected ropings and unchecked optional pots do not contribute", () => {
  assert.deepEqual(summarizeOnlineEntryOptions(ropings, {}, {}, { "one:side": true }), []);
  const result = summarizeOnlineEntryOptions(ropings, { one: true }, {}, {});
  assert.equal(result[0].quantity, 1);
  assert.deepEqual(result[0].options, []);
});

test("required fees itemize base, stock, and once-per-event charges", () => {
  const requiredFees = [
    { id: "base", title: "Jackpot", amountCents: 30000, scope: "entry" },
    { id: "stock", title: "Stock", amountCents: 1500, scope: "entry" },
    { id: "office", title: "Office", amountCents: 2000, scope: "contestant_event" },
  ];
  const result = summarizeOnlineEntryOptions(ropings.map((r) => ({ ...r, options: [], requiredFees })), { one: true, two: true }, { one: 2 }, {});
  assert.deepEqual(result[0].requiredFees.map((f) => f.amountCents), [60000, 3000, 2000]);
  assert.deepEqual(result[1].requiredFees.map((f) => f.amountCents), [30000, 1500, 0]);
});

test("once-per-roping charges are distinct for each selected roping", () => {
  const requiredFees = [{ id: "shared", title: "Roping fee", amountCents: 1500, scope: "contestant_division" }];
  const result = summarizeOnlineEntryOptions(ropings.map((r) => ({ ...r, options: [], requiredFees })), { one: true, two: true }, { one: 3, two: 2 }, {});
  assert.deepEqual(result.map((r) => r.requiredFees[0].amountCents), [1500, 1500]);
});

test("entry-scoped optional fees multiply by entry count", () => {
  const result = summarizeOnlineEntryOptions(ropings, { one: true }, { one: 3 }, { "one:side": true });
  assert.equal(result[0].options[0].amountCents, 15000);
});

test("shared once-per-contestant options are charged once across ropings", () => {
  const result = summarizeOnlineEntryOptions(ropings, { one: true, two: true }, { one: 2, two: 3 }, { "one:office": true, "two:office": true });
  assert.equal(result[0].options[0].amountCents, 2000);
  assert.equal(result[1].options[0].amountCents, 0);
});

test("existing event and roping charges are covered but per-entry fees still apply", () => {
  const requiredFees = [{ id: "office", title: "Office", amountCents: 2000, scope: "contestant_event" }, { id: "stock", title: "Stock", amountCents: 1500, scope: "contestant_division" }, { id: "base", title: "Jackpot", amountCents: 30000, scope: "entry" }];
  const result = summarizeOnlineEntryOptions(ropings.map((r) => ({ ...r, requiredFees })), { one: true, two: true }, { one: 2 }, {}, ["office", "one:stock", "base"]);
  assert.deepEqual(result[0].requiredFees.map((f) => f.amountCents), [0, 0, 60000]);
  assert.deepEqual(result[1].requiredFees.map((f) => f.amountCents), [0, 1500, 30000]);
  assert.equal(result[0].requiredFees[0].alreadyApplied, true);
  assert.equal(result[0].requiredFees[2].alreadyApplied, false);
});
