import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPublicEvent, publicEventHref, publicEventDate } from "../src/lib/events/public-event-navigation.ts";

const events = [
  { slug: "next-weekend", status: "scheduled" },
  { slug: "live-weekend", status: "in_progress" },
  { slug: "last-weekend", status: "completed" },
  { slug: "older-weekend", status: "completed" },
];
test("public results default to live events", () => {
  assert.equal(selectPublicEvent(events).slug, "live-weekend");
});
test("past results remain selectable while another event is live", () => {
  assert.equal(selectPublicEvent(events, "older-weekend").slug, "older-weekend");
});
test("unknown or unpublished event links never fall back to another event", () => {
  assert.equal(selectPublicEvent(events, "private-event"), null);
});
test("default selection falls back to completed results, never upcoming events", () => {
  assert.equal(selectPublicEvent(events.filter((event) => event.status !== "in_progress")).slug, "last-weekend");
  assert.equal(selectPublicEvent([events[0]]), null);
  assert.equal(selectPublicEvent([]), null);
});
test("archive links encode event names and keep results anchor", () => {
  assert.equal(publicEventHref("producer", "fall & finals"), "/public/producer?event=fall%20%26%20finals#results");
});
test("event dates use the producer's Central calendar date", () => {
  assert.equal(publicEventDate("2026-10-11T01:40:00Z"), "Oct 10, 2026");
  assert.equal(publicEventDate("2026-10-10"), "Oct 10, 2026");
});
