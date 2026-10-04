import test from "node:test";
import assert from "node:assert/strict";
import { roundStandings, averageStandings } from "../src/lib/events/public-standings.ts";

const run = (id, time, status = "complete", round = 1) => ({
  id, divisionId: "roping", name: id, entryNumber: 1,
  round, totalTime: time, status, incentiveAdjustment: 0,
});
const average = (id, time, overrides = {}) => ({
  resultId: id, divisionId: "roping", divisionName: "#11.5",
  resultStatus: "unofficial", name: id, entryNumber: 1,
  totalTime: time, incentiveAdjustment: 0, status: "complete",
  roundsCompleted: 3, mainRoundCount: 3, shortRoundQualifier: false,
  ...overrides,
});

test("round tabs filter runs and share places for ties", () => {
  const rows = roundStandings([run("C", 12), run("A", 10), run("B", 10),
    run("NT", null, "no_time"), run("other", 8, "complete", 2)], 1);
  assert.deepEqual(rows.map((row) => [row.id, row.place]), [["A", 1], ["B", 1], ["C", 3], ["NT", null]]);
  assert.deepEqual(roundStandings([], 2), []);
});
test("incomplete averages have progress but no placing", () => {
  const rows = averageStandings([average("partial", 8, {status: "pending", roundsCompleted: 1}),
    average("A", 30), average("B", 30), average("C", 31)]);
  assert.deepEqual(rows.map((row) => row.place), [1, 1, 3, null]);
  assert.equal(rows[3].progress, "1/3 main rounds");
});
test("short round qualifiers cannot place before their final run", () => {
  const rows = averageStandings([average("waiting", 30, {shortRoundQualifier: true, shortRoundStatus: "pending"}),
    average("finished", 40, {shortRoundQualifier: true, shortRoundStatus: "complete"}),
    average("not-qualified", 35)]);
  assert.equal(rows.find((row) => row.id === "waiting").place, null);
  assert.equal(rows.find((row) => row.id === "finished").place, 1);
  assert.equal(rows.find((row) => row.id === "not-qualified").place, null);
});
