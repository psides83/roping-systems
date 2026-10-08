import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, calendarDays, shiftMonth } from "../src/lib/list-controls.ts";

test("Search matches multiple words, ignores case and matches formatted phones", () => {
  assert.equal(matchesSearch(["Jane Smith", "(254) 555-0199"], "SMITH Jane"), true);
  assert.equal(matchesSearch(["Jane Smith", "(254) 555-0199"], "2545550199"), true);
  assert.equal(matchesSearch(["Jane Smith"], "Jane Jones"), false);
  assert.equal(matchesSearch(["Jane Smith"], ""), true);
});
test("Calendar includes leap days and complete Sunday-start weeks", () => {
  const days = calendarDays("2024-02");
  assert.equal(days[0], null);
  assert.equal(days[4], "2024-02-01");
  assert.ok(days.includes("2024-02-29"));
  assert.equal(days.length % 7, 0);
  assert.equal(calendarDays("2026-02").filter(Boolean).length, 28);
});
test("Month navigation crosses year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
