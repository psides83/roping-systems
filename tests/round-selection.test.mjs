import test from "node:test";
import assert from "node:assert/strict";
import { selectDeskRound } from "../src/lib/events/round-selection.ts";

test("New roping opens round one", () => assert.equal(selectDeskRound(undefined, 3), 1));
test("Completed rounds advance the default desk", () => assert.equal(selectDeskRound(undefined, 3, [1]), 2));
test("Earliest unfinished round stays selected", () => assert.equal(selectDeskRound(undefined, 3, [2]), 1));
test("Short round opens after all main rounds complete", () => assert.equal(selectDeskRound(undefined, 4, [1, 2, 3]), 4));
test("Completed roping opens its final round for review", () => assert.equal(selectDeskRound(undefined, 4, [1, 2, 3, 4]), 4));
test("Explicit round selection takes precedence", () => assert.equal(selectDeskRound("1", 3, [1, 2]), 1));
test("Invalid selections fall back to the current unfinished round", () => {
  for (const requested of ["0", "9", "1.5", "oops", ["1", "2"], ""]) {
    assert.equal(selectDeskRound(requested, 3, [1]), 2);
  }
});
