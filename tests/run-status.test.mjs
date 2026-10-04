import assert from "node:assert/strict";
import test from "node:test";
import { runStatusLabels, runStatusAbbreviations, isResolvedRunStatus } from "../src/lib/run-status.ts";

test("turn outs use one label and abbreviation, including historical scratch results", () => {
  for (const status of ["turned_out", "scratch"]) {
    assert.equal(runStatusLabels[status], "Turn out");
    assert.equal(runStatusAbbreviations[status], "TO");
    assert.equal(isResolvedRunStatus(status), true);
  }
});
