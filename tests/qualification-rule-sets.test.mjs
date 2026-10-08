import assert from "node:assert/strict";
import test from "node:test";
import { effectiveQualificationRuleSet, matchesQualificationRuleSet } from "../src/lib/qualification-rule-sets.ts";

const rules = { top_places: 15, minimum_ropings: 10, requirement_match: "all", earned_position_policy: "none" };

test("ropings inherit event rules, opt out, or select a different rule set", () => {
  assert.equal(effectiveQualificationRuleSet("event", "inherit", null), "event");
  assert.equal(effectiveQualificationRuleSet("event", "none", "custom"), null);
  assert.equal(effectiveQualificationRuleSet("event", "custom", "custom"), "custom");
  assert.equal(effectiveQualificationRuleSet(null, "inherit", null), null);
});

test("all regular requirements means both attendance and rank", () => {
  assert.equal(matchesQualificationRuleSet({ rank: 8, ropingsEntered: 10 }, rules), true);
  assert.equal(matchesQualificationRuleSet({ rank: 8, ropingsEntered: 9 }, rules), false);
  assert.equal(matchesQualificationRuleSet({ rank: 16, ropingsEntered: 10 }, rules), false);
});

test("either requirement permits distinct qualification paths", () => {
  const any = { ...rules, requirement_match: "any" };
  assert.equal(matchesQualificationRuleSet({ rank: 8, ropingsEntered: 1 }, any), true);
  assert.equal(matchesQualificationRuleSet({ rank: 30, ropingsEntered: 10 }, any), true);
  assert.equal(matchesQualificationRuleSet({ rank: 30, ropingsEntered: 9 }, any), false);
  assert.equal(matchesQualificationRuleSet(undefined, any), false);
});

test("disabled conditions do not become an automatic OR qualification", () => {
  assert.equal(matchesQualificationRuleSet({ rank: 30, ropingsEntered: 1 }, { ...rules, requirement_match: "any", top_places: null }), false);
  assert.equal(matchesQualificationRuleSet({ rank: 30, ropingsEntered: 10 }, { ...rules, requirement_match: "any", minimum_ropings: 0 }), false);
});

test("earned positions bypass only the requirements selected by the producer", () => {
  const roper = { rank: 30, ropingsEntered: 1, finalsPositions: 2 };
  assert.equal(matchesQualificationRuleSet(roper, rules), false);
  assert.equal(matchesQualificationRuleSet(roper, { ...rules, earned_position_policy: "rank" }), false);
  assert.equal(matchesQualificationRuleSet({ ...roper, ropingsEntered: 10 }, { ...rules, earned_position_policy: "rank" }), true);
  assert.equal(matchesQualificationRuleSet(roper, { ...rules, earned_position_policy: "rank_and_attendance" }), true);
  assert.equal(matchesQualificationRuleSet({ ...roper, rank: 8 }, { ...rules, requirement_match: "any", earned_position_policy: "rank" }), true);
});
