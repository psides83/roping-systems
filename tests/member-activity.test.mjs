import test from "node:test";
import assert from "node:assert/strict";
import { activityDate, memberActivityPage } from "../src/lib/member-activity.ts";
const seasons = [{ id: "s", name: "2026", starts_on: "2026-05-01", ends_on: "2027-04-30" }];
const item = (id, occurredAt, type = "entry", seasonId) => ({ id, occurredAt, type, seasonId, title: "Activity", summary: "Summary", details: [], href: "/members/test" });
test("activity uses the producer calendar and preserves date-only actions", () => {
  assert.equal(activityDate("2026-05-01T01:00:00Z", "America/Chicago"), "2026-04-30");
  assert.equal(activityDate("2026-05-01", "America/Chicago"), "2026-05-01");
});
test("season filters use explicit dues season and calendar dates for other activity", () => {
  const rows = [item("a", "2026-04-30"), item("b", "2026-05-01"), item("c", "2027-04-30"), item("d", "2027-05-01"), item("e", "2026-04-01", "dues", "s")];
  assert.deepEqual(memberActivityPage(rows, seasons, "America/Chicago", { season: "s" }).items.map(row => row.id), ["c", "b", "e"]);
});
test("date range is inclusive, combinable with type, and rejects reversed dates", () => {
  const rows = [item("a", "2026-05-01", "fine"), item("b", "2026-05-02", "entry"), item("c", "2026-05-03", "fine")];
  assert.equal(memberActivityPage(rows, [], "UTC", { type: "fine", from: "2026-05-01", to: "2026-05-03" }).total, 2);
  assert.ok(memberActivityPage(rows, [], "UTC", { from: "2026-05-03", to: "2026-05-01" }).error);
});
test("filters and pagination are safe and do not reorder the original data", () => {
  const rows = Array.from({ length: 65 }, (_, n) => item(String(n).padStart(3, "0"), "2026-05-01"));
  const copy = [...rows];
  const result = memberActivityPage(rows, [], "UTC", { page: "2", type: "constructor", from: "2026-02-30" });
  assert.equal(result.type, "all");
  assert.equal(result.from, undefined);
  assert.equal(result.items[0].id, "030");
  assert.equal(result.pageCount, 3);
  assert.deepEqual(rows, copy);
  assert.equal(memberActivityPage(rows, [], "UTC", { page: "999" }).page, 3);
});
