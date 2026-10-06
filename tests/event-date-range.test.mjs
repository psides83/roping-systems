import test from "node:test";
import assert from "node:assert/strict";
import { eventDateRange } from "../src/lib/events/event-date-range.ts";

test("single-day events display one date", () => {
  assert.equal(eventDateRange("2026-12-12T15:00:00Z", "2026-12-12T23:00:00Z"), "Dec 12, 2026");
});
test("multi-day ranges include the last day and use the producer timezone", () => {
  const label = eventDateRange("2026-12-12T15:00:00Z", "2026-12-14T01:00:00Z");
  assert.match(label, /Dec 12/);
  assert.match(label, /13/);
  assert.doesNotMatch(label, /14/);
});
test("cross-month and cross-year events retain both calendar boundaries", () => {
  const label = eventDateRange("2026-12-31T15:00:00Z", "2027-01-02T23:00:00Z");
  for (const part of ["Dec", "31", "2026", "Jan", "2", "2027"]) assert.ok(label.includes(part));
});
test("missing or invalid end dates fall back to the start", () => {
  assert.equal(eventDateRange("2026-12-12T15:00:00Z", "invalid"), "Dec 12, 2026");
  assert.equal(eventDateRange("2026-12-12T15:00:00Z"), "Dec 12, 2026");
});
