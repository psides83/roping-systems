import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAgeRange, penaltyTotal } from "../src/lib/penalties.ts";
test("selected penalties stack and total rounds to hundredths", () => {
  const options = [{ id: "barrier", name: "Barrier", seconds: 5 }, { id: "other", name: "Other", seconds: 0.15 }];
  assert.equal(penaltyTotal(options, []), 0);
  assert.equal(penaltyTotal(options, ["barrier", "other"]), 5.15);
  assert.equal(penaltyTotal(options, ["barrier", "barrier"]), 5);
  assert.equal(penaltyTotal(options, ["invalid"]), 0);
});
test("age range labels describe open-ended and bounded ranges", () => {
  assert.equal(formatAgeRange(80, null), "80 and over");
  assert.equal(formatAgeRange(null, 19), "19 and under");
  assert.equal(formatAgeRange(0, null), "0 and over");
  assert.equal(formatAgeRange(19, 40), "Ages 19-40");
  assert.equal(formatAgeRange(19, 19), "Age 19");
  assert.equal(formatAgeRange(null, null), "All ages");
});
