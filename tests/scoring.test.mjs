import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinalRunTime, resolveTimerReadings, formatFinalTimeAdjustment } from "../src/lib/scoring.ts";

test("timer methods use every reading", () => {
  assert.equal(resolveTimerReadings(["10", "12"], "average"), 11);
  assert.equal(resolveTimerReadings(["10", "12"], "best"), 10);
  assert.equal(resolveTimerReadings(["10", "12"], "longest"), 12);
});
test("incomplete, negative, and nonfinite readings cannot be saved", () => {
  for (const readings of [[], [" "], ["10", ""], ["-1"], ["Infinity"], ["abc"]]) {
    assert.equal(resolveTimerReadings(readings, "average"), null);
  }
  assert.equal(resolveTimerReadings(["0"], "average"), 0);
});
test("penalties and signed handicap adjustments", () => {
  assert.equal(calculateFinalRunTime(10, 5, 2), 13);
  assert.equal(calculateFinalRunTime(10, 0, -2), 12);
  assert.equal(formatFinalTimeAdjustment(2), "-2.000");
  assert.equal(formatFinalTimeAdjustment(-2), "+2.000");
});
test("short-round credit never reduces the carried main-round aggregate", () => {
  assert.equal(20 + calculateFinalRunTime(1, 0, 3), 20);
});
