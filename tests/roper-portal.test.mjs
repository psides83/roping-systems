import test from "node:test";
import assert from "node:assert/strict";
import { groupPortalEntries, portalResultsLink } from "../src/lib/roper-portal.ts";

const entry = (id, date, overrides = {}) => ({ id, date, number: 1, competitionStatus: "active", status: "scheduled", ...overrides });
test("portal keeps completed and withdrawn entries in history and sorts upcoming chronologically", () => {
  const rows = [entry("later", "2026-11-02"), entry("earlier", "2026-11-01"), entry("finished", "2026-11-03", { status: "completed" }), entry("withdrawn", "2026-11-04", { competitionStatus: "withdrawn" })];
  const result = groupPortalEntries(rows, "2026-10-07");
  assert.deepEqual(result.upcoming.map(x => x.id), ["earlier", "later"]);
  assert.deepEqual(result.past.map(x => x.id), ["withdrawn", "finished"]);
  assert.equal(rows[0].id, "later");
});
test("live ropings remain current across midnight while older unstarted entries become history", () => {
  const result = groupPortalEntries([entry("live", "2026-10-06", { status: "in_progress" }), entry("old", "2026-10-06")], "2026-10-07");
  assert.equal(result.upcoming[0].id, "live");
  assert.equal(result.past[0].id, "old");
});
test("private events do not receive public result links", () => {
  const membership = { producerSlug: "test-producer" };
  assert.equal(portalResultsLink(membership, { public: false }), null);
  assert.equal(portalResultsLink(membership, { public: true, eventSlug: "weekend", ropingId: "roping-1" }), "/public/test-producer?event=weekend&roping=roping-1");
});
