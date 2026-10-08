import test from "node:test";
import assert from "node:assert/strict";
import { calculateQualificationStandings, UNRANKED_QUALIFICATION } from "../src/lib/season-standings.ts";
import { matchesQualificationRuleSet } from "../src/lib/qualification-rule-sets.ts";

const season = { startsOn: "2026-05-01", endsOn: "2027-04-30" };
const entry = (roperId, date, cents, overrides = {}) => ({ roperId, classId: "11", date, ropingId: `${roperId}:${date}`, winningsCents: cents, official: true, ...overrides });
const rule = { top_places: 1, minimum_ropings: 2, requirement_match: "all", earned_position_policy: "none" };

test("later attendance counts without changing standings winnings or rank", () => {
  const { rows } = calculateQualificationStandings([
    entry("a", "2026-06-01", 200), entry("b", "2026-06-01", 100),
    entry("a", "2026-07-10", 500), entry("b", "2026-07-10", 10000),
  ], [], season, "2026-06-30", "2026-07-10");
  const a = rows.find((row) => row.roperId === "a");
  assert.equal(a.rank, 1); assert.equal(a.winningsCents, 200); assert.equal(a.ropingsEntered, 2);
  assert.equal(matchesQualificationRuleSet(a, rule), true);
  assert.equal(rows.find((row) => row.roperId === "b").rank, 2);
});

test("attendance may close earlier than standings", () => {
  const { rows } = calculateQualificationStandings([entry("a", "2026-06-01", 100), entry("a", "2026-07-10", 500)], [], season, "2026-07-10", "2026-06-30");
  assert.equal(rows[0].winningsCents, 600); assert.equal(rows[0].ropingsEntered, 1);
  assert.equal(matchesQualificationRuleSet(rows[0], rule), false);
});

test("attendance-only late ropers cannot earn a rank but can meet an attendance-only or OR requirement", () => {
  const { rows } = calculateQualificationStandings([entry("late", "2026-07-10", 10000, { attendanceCount: 2 })], [], season, "2026-06-30", "2026-07-10");
  assert.equal(rows[0].rank, UNRANKED_QUALIFICATION); assert.equal(rows[0].winningsCents, 0);
  assert.equal(matchesQualificationRuleSet(rows[0], rule), false);
  assert.equal(matchesQualificationRuleSet(rows[0], { ...rule, top_places: null }), true);
  assert.equal(matchesQualificationRuleSet(rows[0], { ...rule, requirement_match: "any" }), true);
});

test("each cutoff includes its own date and excludes the following day", () => {
  const { rows } = calculateQualificationStandings([
    entry("a", "2026-06-30", 100), entry("a", "2026-07-01", 200),
    entry("a", "2026-07-10", 300), entry("a", "2026-07-11", 400),
  ], [], season, "2026-06-30", "2026-07-10");
  assert.equal(rows[0].winningsCents, 100); assert.equal(rows[0].ropingsEntered, 3);
});

test("blank cutoffs independently default to season end and ignore unofficial or other-season results", () => {
  const { rows } = calculateQualificationStandings([
    entry("a", "2027-04-30", 100), entry("a", "2027-05-01", 500),
    entry("a", "2026-04-30", 500), entry("a", "2026-06-01", 500, { official: false }),
  ], [], season);
  assert.equal(rows[0].winningsCents, 100); assert.equal(rows[0].ropingsEntered, 1);
});

test("different cutoffs retain class-specific attendance while carryover money remains frozen at the standings cutoff", () => {
  const contributions = [entry("a", "2026-06-01", 100), entry("a", "2026-07-10", 200, { classId: "10" })];
  const moves = [{ id: "move", roperId: "a", fromClassId: "11", toClassId: "10", date: "2026-07-01", capAtLeader: false, classLadder: ["11", "10", "9"] }];
  const { rows } = calculateQualificationStandings(contributions, moves, season, "2026-06-30", "2026-07-10");
  assert.equal(rows.find((row) => row.classId === "11").winningsCents, 100);
  assert.equal(rows.find((row) => row.classId === "11").ropingsEntered, 1);
  assert.equal(rows.find((row) => row.classId === "10").ropingsEntered, 1);
  assert.equal(rows.find((row) => row.classId === "10").rank, UNRANKED_QUALIFICATION);
});
