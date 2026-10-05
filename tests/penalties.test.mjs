import { test } from "node:test";
import assert from "node:assert/strict";
import { penaltyTotal } from "../src/lib/penalties.ts";
test("selected penalties stack and total rounds to hundredths", () => {
  const options = [{ id: "barrier", name: "Barrier", seconds: 5 }, { id: "other", name: "Other", seconds: 0.15 }];
  assert.equal(penaltyTotal(options, []), 0);
  assert.equal(penaltyTotal(options, ["barrier", "other"]), 5.15);
  assert.equal(penaltyTotal(options, ["barrier", "barrier"]), 5);
  assert.equal(penaltyTotal(options, ["invalid"]), 0);
});
