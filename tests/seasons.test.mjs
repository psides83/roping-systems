import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonStartYear, seasonLabel, browseResultEvents } from "../src/lib/seasons.ts";

test("May seasons span two calendar years at the exact month boundary", () => {
  assert.equal(seasonStartYear("2026-05-01", 5, "America/Chicago"), 2026);
  assert.equal(seasonStartYear("2027-04-30", 5, "America/Chicago"), 2026);
  assert.equal(seasonStartYear("2027-05-01", 5, "America/Chicago"), 2027);
  assert.equal(seasonLabel(2026, 5), "May 2026 - Apr 2027");
  assert.equal(seasonLabel(2026, 1), "2026");
});
test("season assignment uses the producer timezone, not UTC", () => {
  assert.equal(seasonStartYear("2027-05-01T02:00:00Z", 5, "America/Chicago"), 2026);
  assert.equal(seasonStartYear("2027-05-01T05:00:00Z", 5, "America/Chicago"), 2027);
  assert.equal(seasonStartYear("invalid", 5, "America/Chicago"), null);
});
const events = [
  { title: "Old", status: "completed", startsAt: "2025-08-01", venue: "Arena", address: "TX" },
  { title: "New", status: "completed", startsAt: "2026-09-01", venue: "Arena", address: "TX" },
  { title: "Live", status: "in_progress", startsAt: "2026-10-01", venue: "Arena", address: "TX" },
  { title: "Upcoming", status: "scheduled", startsAt: "2026-11-01", venue: "Arena", address: "TX" },
];
test("results have independent live and past groups, with reversible date sorting", () => {
  const newest = browseResultEvents(events, "", "all", 5, "America/Chicago", false);
  assert.deepEqual(newest.live.map((event) => event.title), ["Live"]);
  assert.deepEqual(newest.past.map((event) => event.title), ["New", "Old"]);
  assert.deepEqual(browseResultEvents(events, "", "all", 5, "America/Chicago", true).past.map((event) => event.title), ["Old", "New"]);
  assert.equal(events[0].title, "Old");
});
test("archive season filters never hide live events; search filters both groups", () => {
  const filtered = browseResultEvents(events, "", "2025", 5, "America/Chicago", false);
  assert.deepEqual(filtered.past.map((event) => event.title), ["Old"]);
  assert.equal(filtered.live.length, 1);
  const searched = browseResultEvents(events, "new", "all", 5, "America/Chicago", false);
  assert.equal(searched.live.length, 0);
  assert.deepEqual(searched.past.map((event) => event.title), ["New"]);
});
