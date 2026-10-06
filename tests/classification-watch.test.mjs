import { test } from "node:test";
import assert from "node:assert/strict";
import { groupWatchFlags, watchMoveOptions } from "../src/lib/classification-watch.ts";

const flag = (id, overrides = {}) => ({
  id, membership_id: "member", division_id: "tie-down", assignment_id: "assignment", rule_id: "rule",
  is_active: true, reviewed_at: null, rule_snapshot: { review_count: 3 }, ...overrides,
});

test("each qualifying run counts, not each roping day", () => {
  const groups = groupWatchFlags([flag("1"), flag("2"), flag("3")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].runs.length, 3);
  assert.equal(groups[0].reviewDue, true);
});
test("corrected and staff-reviewed runs do not add pending occurrences", () => {
  const groups = groupWatchFlags([flag("1"), flag("2", { is_active: false }), flag("3", { reviewed_at: "2026-10-05" })]);
  assert.equal(groups[0].runs.length, 1);
  assert.equal(groups[0].reviewDue, false);
});
test("counts remain separate by rule, member, division, and classification assignment", () => {
  const groups = groupWatchFlags([flag("1"), flag("2", { rule_id: "other" }), flag("3", { membership_id: "other" }), flag("4", { division_id: "breakaway" }), flag("5", { assignment_id: "new" })]);
  assert.equal(groups.length, 5);
  assert.ok(groups.every((g) => !g.reviewDue));
});

const choices = [
  { id: "15", division_id: "tie-down", name: "#15", is_active: true },
  { id: "13", division_id: "tie-down", name: "#13", is_active: true },
  { id: "11", division_id: "tie-down", name: "#11", is_active: false },
  { id: "open", division_id: "breakaway", name: "Open", is_active: true },
];
const current = { id: "assignment", membership_id: "member", division_id: "tie-down", classification_id: "15", effective_on: "2026-10-01" };
test("approval offers active classifications in the same division, excluding the current class", () => {
  const options = watchMoveOptions(flag("1"), choices, [current]);
  assert.equal(options.canApprove, true);
  assert.deepEqual(options.choices.map((c) => c.id), ["13"]);
});
test("old assignment evidence remains reviewable but cannot approve another move", () => {
  assert.equal(watchMoveOptions(flag("1"), choices, [{ ...current, id: "new-assignment" }]).canApprove, false);
  assert.equal(watchMoveOptions(flag("1"), choices, []).canApprove, false);
  assert.equal(watchMoveOptions(flag("1"), [choices[0]], [current]).canApprove, false);
});
