import test from "node:test";
import assert from "node:assert/strict";
import { calendarDate, calendarEventDates, calendarFile, googleCalendarUrl } from "../src/lib/events/calendar-export.ts";

const event = { id: "test-123", title: "Weekend Roping", startsAt: "2026-12-12T15:00:00Z", endsAt: "2026-12-13T23:00:00Z", location: "Circle T Arena, Hamilton, TX", timezone: "America/Chicago", url: "https://example.com/public/producer/schedule#event-test-123" };
test("calendar export includes the whole multi-day event with exclusive end dates", () => {
  assert.deepEqual(calendarEventDates(event), { start: "2026-12-12", end: "2026-12-13", exclusiveEnd: "2026-12-14" });
  const file = calendarFile(event, new Date("2026-10-08T12:00:00Z"));
  assert.match(file, /DTSTART;VALUE=DATE:20261212\r\nDTEND;VALUE=DATE:20261214/);
  assert.match(file, /DTSTAMP:20261008T120000Z/);
  assert.match(file, /UID:test-123@roping-systems/);
  assert.match(file, /LOCATION:Circle T Arena\\, Hamilton\\, TX/);
  assert.ok(file.endsWith("END:VCALENDAR\r\n"));
});
test("date-only export respects producer timezone, not UTC or browser timezone", () => {
  assert.equal(calendarDate("2026-10-09T01:00:00Z", "America/Chicago"), "2026-10-08");
  assert.equal(calendarDate("2026-10-09T01:00:00Z", "Asia/Tokyo"), "2026-10-09");
  assert.equal(calendarEventDates({ ...event, startsAt: "2026-12-31T15:00:00Z", endsAt: null }).exclusiveEnd, "2027-01-01");
});
test("Google event drafts include dates, title, location and public schedule URL", () => {
  const url = new URL(googleCalendarUrl(event));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("dates"), "20261212/20261214");
  assert.equal(url.searchParams.get("ctz"), "America/Chicago");
  assert.equal(url.searchParams.get("location"), event.location);
  assert.ok(url.searchParams.get("details").includes(event.url));
});
test("ICS escapes untrusted text and folds UTF-8 lines without splitting characters", () => {
  const file = calendarFile({ ...event, title: "Awards, Finals; \\ Ranch\r\nBEGIN:VEVENT " + "🐎".repeat(60) });
  assert.equal(file.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
  assert.match(file, /Awards\\, Finals\\; \\\\ Ranch\\nBEGIN:VEVENT/);
  for (const line of file.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(file.replace(/\r\n /g, "").includes("🐎".repeat(60)));
});
