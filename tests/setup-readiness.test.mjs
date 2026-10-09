import test from "node:test";
import assert from "node:assert/strict";
import { setupReadiness } from "../src/lib/events/setup-readiness.ts";

const dates = { first: "2026-10-10", last: "2026-10-11" };
const roping = { id: "r1", name: "#11.5 Tie-down", date: dates.first, arena: "Arena 1", order: 1, schedule: "fixed", startsAt: "2026-10-10T14:00:00Z", payoutIssues: [], hasMainPayout: true };
const review = (rows, mode = "start", updates = []) => setupReadiness("event", mode, dates, rows, updates);
test("complete event passes; empty event blocks", () => {
  assert.deepEqual(review([roping]), []);
  assert.equal(review([])[0].severity, "blocker");
});
test("fixed times and outside dates block; tentative missing times warn", () => {
  assert.equal(review([{ ...roping, startsAt: null }])[0].severity, "blocker");
  assert.equal(review([{ ...roping, date: "2026-10-12" }])[0].severity, "blocker");
  assert.equal(review([{ ...roping, startsAt: null, schedule: "tentative" }])[0].severity, "warning");
});
test("followed-by must have a predecessor on the same date and arena", () => {
  const following = { ...roping, id: "r2", order: 2, schedule: "follows_previous", startsAt: null };
  assert.deepEqual(review([roping, following]), []);
  assert.equal(review([roping, { ...following, arena: "Arena 2" }])[0].severity, "blocker");
  assert.equal(review([roping, { ...following, date: dates.last }])[0].severity, "blocker");
});
test("incomplete payout snapshots block start, but allow advance publication", () => {
  const incomplete = { ...roping, payoutIssues: ["Average: missing paid places"] };
  assert.equal(review([incomplete])[0].severity, "blocker");
  assert.equal(review([incomplete], "publish")[0].severity, "warning");
  assert.equal(review([{ ...roping, hasMainPayout: false }])[0].severity, "warning");
});
test("collisions warn only within same day and fixed arena; equivalent instants match", () => {
  const second = { ...roping, id: "r2", order: 2, startsAt: "2026-10-10T09:00:00-05:00" };
  assert.equal(review([roping, second]).length, 2);
  assert.deepEqual(review([roping, { ...second, arena: "Arena 2" }]), []);
  assert.deepEqual(review([{ ...roping, arena: null }, { ...second, arena: null }]), []);
});
test("template changes warn unless explicitly retained; empty changes do not warn", () => {
  const update = { ropingId: roping.id, dismissed: false, changes: [{}] };
  assert.equal(review([roping], "start", [update])[0].severity, "warning");
  assert.deepEqual(review([roping], "start", [{ ...update, dismissed: true }]), []);
  assert.deepEqual(review([roping], "start", [{ ...update, changes: [] }]), []);
});
