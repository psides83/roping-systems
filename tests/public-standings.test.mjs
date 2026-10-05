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
  assert.equal(rows[3].progress, "On one");
});
test("partial aggregates show qualified times but rank below ropers with more times", () => {
  const rows = averageStandings([average("two", 22.45, { status: "no_time", roundsCompleted: 2 }),
    average("three", 45), average("one", 10, { status: "no_time", roundsCompleted: 1 }),
    average("none", null, { status: "no_time", roundsCompleted: 0 })]);
  assert.deepEqual(rows.map((row) => row.id), ["three", "two", "one", "none"]);
  assert.equal(rows[1].time, 22.45);
  assert.equal(rows[1].progress, "On two");
  assert.equal(rows[1].place, null);
  assert.equal(rows[3].progress, "No qualified times");
});
test("a qualified short round counts toward the on count", () => {
  const rows = averageStandings([average("final", 40, { shortRoundQualifier: true, shortRoundStatus: "complete" })]);
  assert.equal(rows[0].progress, "On four · Short round qualifier");
});
test("short round qualifiers cannot place before their final run", () => {
  const rows = averageStandings([average("waiting", 30, {shortRoundQualifier: true, shortRoundStatus: "pending"}),
    average("finished", 40, {shortRoundQualifier: true, shortRoundStatus: "complete"}),
    average("not-qualified", 35)]);
  assert.equal(rows.find((row) => row.id === "waiting").place, null);
  assert.equal(rows.find((row) => row.id === "finished").place, 1);
  assert.equal(rows.find((row) => row.id === "not-qualified").place, null);
});
