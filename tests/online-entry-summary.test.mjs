import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOnlineEntryOptions } from "../src/lib/online-entry-summary.ts";

const ropings = [
  { id: "one", name: "#11 Tie-down", options: [{ id: "side", title: "Side Pot", amountCents: 5000, scope: "entry" }, { id: "office", title: "Office", amountCents: 2000, scope: "event" }] },
  { id: "two", name: "Open Breakaway", options: [{ id: "office", title: "Office", amountCents: 2000, scope: "event" }] },
];

test("unselected ropings and unchecked optional pots do not contribute", () => {
  assert.deepEqual(summarizeOnlineEntryOptions(ropings, {}, {}, { "one:side": true }), []);
  const result = summarizeOnlineEntryOptions(ropings, { one: true }, {}, {});
  assert.equal(result[0].quantity, 1);
  assert.deepEqual(result[0].options, []);
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
