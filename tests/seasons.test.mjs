import { test } from "node:test";
import assert from "node:assert/strict";
import { eventSeason, seasonCalendarDate, browseResultEvents } from "../src/lib/seasons.ts";

const seasons = [
  { id: "prior", name: "2025-2026", startsOn: "2025-05-26", endsOn: "2026-04-27" },
  { id: "current", name: "2026-2027", startsOn: "2026-05-26", endsOn: "2027-04-27" },
];
test("season boundaries are exact and inclusive, with gaps allowed", () => {
  assert.equal(eventSeason("2026-05-25", seasons, "America/Chicago"), undefined);
  assert.equal(eventSeason("2026-05-26", seasons, "America/Chicago").id, "current");
  assert.equal(eventSeason("2027-04-27", seasons, "America/Chicago").id, "current");
  assert.equal(eventSeason("2027-04-28", seasons, "America/Chicago"), undefined);
  assert.equal(eventSeason("invalid", seasons, "America/Chicago"), undefined);
});
test("season assignment uses the producer calendar date", () => {
  assert.equal(seasonCalendarDate("2026-05-26T02:00:00Z", "America/Chicago"), "2026-05-25");
  assert.equal(eventSeason("2026-05-26T05:00:00Z", seasons, "America/Chicago").id, "current");
});
const events = [
  { title: "Old", status: "completed", startsAt: "2025-08-01", venue: "Arena", address: "TX" },
  { title: "New", status: "completed", startsAt: "2026-09-01", venue: "Arena", address: "TX" },
  { title: "Gap", status: "completed", startsAt: "2026-05-01", venue: "Arena", address: "TX" },
  { title: "Live", status: "in_progress", startsAt: "2026-10-01", venue: "Arena", address: "TX" },
  { title: "Upcoming", status: "scheduled", startsAt: "2026-11-01", venue: "Arena", address: "TX" },
];
test("live events remain visible independently of past season filtering", () => {
  const filtered = browseResultEvents(events, "", "prior", seasons, "America/Chicago", false);
  assert.deepEqual(filtered.past.map((event) => event.title), ["Old"]);
  assert.deepEqual(filtered.live.map((event) => event.title), ["Live"]);
  assert.deepEqual(browseResultEvents(events, "", "unassigned", seasons, "America/Chicago", false).past.map((event) => event.title), ["Gap"]);
});
test("all seasons retains unmatched results and sorts without mutating input", () => {
  assert.deepEqual(browseResultEvents(events, "", "all", seasons, "America/Chicago", false).past.map((event) => event.title), ["New", "Gap", "Old"]);
  assert.deepEqual(browseResultEvents(events, "", "all", seasons, "America/Chicago", true).past.map((event) => event.title), ["Old", "Gap", "New"]);
  assert.equal(events[0].title, "Old");
  assert.deepEqual(browseResultEvents(events, "new", "all", seasons, "America/Chicago", false).past.map((event) => event.title), ["New"]);
});
