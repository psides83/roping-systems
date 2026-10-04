import test from "node:test";
import assert from "node:assert/strict";
import { templateReviewRows } from "../src/lib/events/template-review.ts";

test("fee review shows the changed purse contribution without exposing IDs", () => {
  const fee = { source_fee_id: "example", title: "Production Charge", amount_cents: 10500, contributes_to_payout: true };
  assert.deepEqual(templateReviewRows({ section: "fees", current: [fee], template: [{ ...fee, contributes_to_payout: false }] }), [
    { label: "Production Charge · Main purse contribution", current: "Yes", template: "No" },
  ]);
});
test("fee changes are formatted as dollars", () => {
  assert.deepEqual(templateReviewRows({ section: "fees", current: [{ title: "Entry", amount_cents: 20000 }], template: [{ title: "Entry", amount_cents: 25000 }] }), [
    { label: "Entry · Fee", current: "$200.00", template: "$250.00" },
  ]);
});
test("handicap review uses final-time signs", () => {
  const rows = templateReviewRows({ section: "handicap", current: [{ classification: "A", credit_seconds: 1 }], template: [{ classification: "A", credit_seconds: -1 }] });
  assert.equal(rows[0].current, "-1 sec");
  assert.equal(rows[0].template, "+1 sec");
});
