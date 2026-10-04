import test from "node:test";
import assert from "node:assert/strict";
import { parseHandicapRules } from "../src/lib/handicap-rules.ts";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];

test("handicap templates accept subtractive, zero, and additive adjustments together", () => {
  const rules = [0.5, 0.25, 0, -0.25].map((adjustmentSeconds, index) => ({
    classificationId: ids[index], adjustmentSeconds,
  }));
  const parsed = parseHandicapRules(JSON.stringify(rules));
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, rules);
});

test("invalid adjustments and malformed selections are rejected", () => {
  for (const adjustmentSeconds of [-60.01, 60.01, null, "", "abc"]) {
    assert.equal(parseHandicapRules(JSON.stringify([
      {classificationId: ids[0], adjustmentSeconds},
    ])).success, false);
  }
  assert.equal(parseHandicapRules("not json").success, false);
  assert.equal(parseHandicapRules("{}").success, false);
});
