import { test } from "node:test";
import assert from "node:assert/strict";
import { ropingDisplayName } from "../src/lib/events/roping-display-name.ts";

test("scheduled ropings include their division for open, numbered and special formats", () => {
  assert.equal(ropingDisplayName("Open", "Tie-down"), "Open Tie-down");
  assert.equal(ropingDisplayName("Open", "Breakaway Roping"), "Open Breakaway");
  assert.equal(ropingDisplayName("#11.5", "Tie-down"), "#11.5 Tie-down");
  assert.equal(ropingDisplayName("Handicap", "Breakaway Roping"), "Handicap Breakaway");
  assert.equal(ropingDisplayName("4-D Open", "Breakaway"), "4-D Open Breakaway");
});
test("existing names and division abbreviations do not create duplicated labels", () => {
  assert.equal(ropingDisplayName("Open Tie-down", "Tie-down"), "Open Tie-down");
  assert.equal(ropingDisplayName("Open Tie Down", "Tie-down"), "Open Tie Down");
  assert.equal(ropingDisplayName("Open TD", "Tie-down Roping"), "Open Tie-down");
  assert.equal(ropingDisplayName("4-D BA", "Breakaway Roping"), "4-D Breakaway");
  assert.equal(ropingDisplayName("Youth", "Junior Roping"), "Youth Junior");
});
