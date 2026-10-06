import test from "node:test";
import assert from "node:assert/strict";
import { groupScheduleByArena } from "../src/lib/events/arena-schedule.ts";

test("arena sections sort numerically and keep First Available last", () => {
  const items = ["First Available", "Arena 10", "Arena 2", "Arena 1"];
  assert.deepEqual(groupScheduleByArena(items, (item) => item).map((group) => group.name),
    ["Arena 1", "Arena 2", "Arena 10", "First Available"]);
});

test("grouping preserves each arena's running order without changing the source", () => {
  const items = [{ id: 1, arena: "Arena 1" }, { id: 2, arena: "Arena 2" }, { id: 3, arena: "Arena 1" }];
  assert.deepEqual(groupScheduleByArena(items, (item) => item.arena)[0].ropings.map((item) => item.id), [1, 3]);
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3]);
});

test("missing arenas remain visible and empty schedules have no sections", () => {
  assert.equal(groupScheduleByArena([null], (item) => item)[0].name, "Arena not assigned");
  assert.deepEqual(groupScheduleByArena([], (item) => item), []);
});
