import { test } from "node:test";
import assert from "node:assert/strict";
import { payoutScheduleIssues } from "../src/lib/payout-schedule-validation.ts";

const bracket = { minimumEntries: 1, maximumEntries: null, percentages: [100] };
const schedule = {
  goRoundsPercent: 50, aggregatePercent: 50, shortRoundPercent: 0,
  shortRoundEnabled: false, competitionFormat: "standard", fourDSettings: null,
  bracketsByStage: { go_round: [bracket], aggregate: [bracket], short_round: [] },
};
test("complete standard schedule covers all entry counts", () => {
  assert.deepEqual(payoutScheduleIssues(schedule), []);
});
test("missing average coverage is incomplete", () => {
  assert.match(payoutScheduleIssues({ ...schedule, bracketsByStage: { ...schedule.bracketsByStage, aggregate: [{ ...bracket, maximumEntries: 30 }] } }).join(" "), /Average.*no maximum/);
});
test("gaps, overlaps and percentage totals are rejected", () => {
  for (const minimumEntries of [10, 12]) {
    assert.match(payoutScheduleIssues({ ...schedule, bracketsByStage: { ...schedule.bracketsByStage, go_round: [{ ...bracket, maximumEntries: 10 }, { ...bracket, minimumEntries }] } }).join(" "), /gaps or overlaps/);
  }
  assert.match(payoutScheduleIssues({ ...schedule, bracketsByStage: { ...schedule.bracketsByStage, go_round: [{ ...bracket, percentages: [50] }] } }).join(" "), /totaling 100/);
});
test("4D requires every configured paid place, including overlapping ranges", () => {
  const fourD = { ...schedule, competitionFormat: "four_d", goRoundsPercent: 100, aggregatePercent: 0,
    fourDSettings: { splitSeconds: 0.5, brackets: [
      { minimumEntries: 1, maximumEntries: 28, activeDivisions: 4, purseBasisPoints: [3300,2800,2200,1700], placesByDivision: [1,1,1,1] },
      { minimumEntries: 29, maximumEntries: null, activeDivisions: 4, purseBasisPoints: [3300,2800,2200,1700], placesByDivision: [4,4,4,4] },
    ] },
  };
  assert.match(payoutScheduleIssues(fourD).join(" "), /at least 4/);
  assert.deepEqual(payoutScheduleIssues({ ...fourD, bracketsByStage: { ...fourD.bracketsByStage, go_round: [{ ...bracket, percentages: [40,30,20,10] }] } }), []);
});
