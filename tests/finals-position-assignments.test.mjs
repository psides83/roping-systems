import test from "node:test";
import assert from "node:assert/strict";
import { finalsPositionSlots, assignedFinalsTotals } from "../src/lib/finals-position-assignments.ts";

const award = { id: "manual:award", producerId: "producer", seasonId: "season", classId: "11", earnedClassId: "11", memberId: "member", positions: 2, source: "manual", revoked: false, moves: [] };
const assignment = { id: "assignment", award_key: award.id, position_number: 1, event_roping_id: "finals", assigned_class_key: "11", assigned_at: "2026-06-01", reason: "Assign to finals" };

test("earned positions are pending until assigned to a specific roping", () => {
  const slots = finalsPositionSlots([award], [], "2027-04-30", "2026-10-07");
  assert.deepEqual(slots.map((slot) => slot.status), ["pending", "pending"]);
  assert.deepEqual(assignedFinalsTotals(slots, "finals"), []);
});
test("one position applies only to its selected target", () => {
  const slots = finalsPositionSlots([award], [assignment], "2027-04-30", "2026-10-07");
  assert.deepEqual(slots.map((slot) => slot.status), ["assigned", "pending"]);
  assert.deepEqual(assignedFinalsTotals(slots, "finals"), [{ memberId: "member", classId: "11", positions: 1 }]);
  assert.deepEqual(assignedFinalsTotals(slots, "different-final"), []);
});
test("unassigned positions expire after the season, not on its last day", () => {
  assert.equal(finalsPositionSlots([award], [], "2027-04-30", "2027-04-30")[0].status, "pending");
  const slots = finalsPositionSlots([award], [assignment], "2027-04-30", "2027-05-01");
  assert.deepEqual(slots.map((slot) => slot.status), ["assigned", "expired"]);
  assert.equal(assignedFinalsTotals(slots, "finals")[0].positions, 1);
});
test("class moves require assignment review and never grant bonus capacity in the old class", () => {
  const slots = finalsPositionSlots([{ ...award, classId: "10" }], [assignment], "2027-04-30", "2026-10-07");
  assert.equal(slots[0].status, "needs_review");
  assert.deepEqual(assignedFinalsTotals(slots, "finals"), []);
});
test("revocations and reduced award counts remove stale assigned allowances", () => {
  assert.deepEqual(finalsPositionSlots([{ ...award, revoked: true }], [assignment], "2027-04-30", "2026-10-07"), []);
  const slots = finalsPositionSlots([{ ...award, positions: 1 }], [{ ...assignment, position_number: 2 }], "2027-04-30", "2026-10-07");
  assert.equal(slots.length, 1);
  assert.deepEqual(assignedFinalsTotals(slots, "finals"), []);
});
test("returning an assigned position to pending removes its target allowance", () => {
  const slots = finalsPositionSlots([award], [{ ...assignment, event_roping_id: null, assigned_at: null }], "2027-04-30", "2026-10-07");
  assert.equal(slots[0].status, "pending");
  assert.deepEqual(assignedFinalsTotals(slots, "finals"), []);
});
