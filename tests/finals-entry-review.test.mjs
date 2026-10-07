import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind } from "typescript";
import * as eligibility from "../src/lib/finals-entry-eligibility.ts";

const compiled = { exports: {} };
const source = transpileModule(readFileSync(new URL("../src/lib/finals-entry-review.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS },
}).outputText;
new Function("require", "module", "exports", source)(() => eligibility, compiled, compiled.exports);
const { reviewFinalsEntry, qualificationCheckIsCurrent } = compiled.exports;
const requirements = { topPlaces: 10, minimumRopings: 5, earnedPositionPolicy: "rank" };
const row = { rank: 20, ropingsEntered: 5, finalsPositions: 2 };

test("finals review combines regular and bonus allowances and subtracts accepted entries", () => {
  const review = reviewFinalsEntry(row, requirements, 1, true, 2);
  assert.equal(review.qualified, true);
  assert.equal(review.allowance, 3);
  assert.equal(review.remaining, 1);
  assert.deepEqual(review.reasons, []);
  assert.equal(review.needsReview, false);
});

test("attendance failures remove bonus capacity and flag accepted entries", () => {
  const review = reviewFinalsEntry({ ...row, ropingsEntered: 3 }, requirements, 1, true, 2);
  assert.equal(review.qualified, false);
  assert.equal(review.bonus, 0);
  assert.equal(review.remaining, 0);
  assert.equal(review.needsReview, true);
  assert.deepEqual(review.reasons, ["2 more ropings needed"]);
});

test("producer attendance waiver qualifies earned positions without standings rank", () => {
  const review = reviewFinalsEntry({ ...row, ropingsEntered: 0 }, { ...requirements, earnedPositionPolicy: "rank_and_attendance" }, 1, true, 0);
  assert.equal(review.qualified, true);
  assert.deepEqual(review.reasons, []);
});

test("disabled bonuses and reduced allowances flag excess entries without removing them", () => {
  const review = reviewFinalsEntry(row, requirements, 1, false, 2);
  assert.equal(review.allowance, 1);
  assert.equal(review.overAllowance, true);
  assert.equal(review.needsReview, true);
  assert.equal(review.remaining, 0);
});

test("unlimited allowances remain unlimited and missing setup never reports eligibility", () => {
  const review = reviewFinalsEntry(row, requirements, null, true, 9);
  assert.equal(review.allowance, null);
  assert.equal(review.remaining, null);
  assert.equal(review.bonus, 0);
  assert.equal(review.needsReview, false);
  assert.equal(reviewFinalsEntry(row, null, 1, true, 0).qualified, false);
  assert.deepEqual(reviewFinalsEntry(undefined, requirements, 1, true, 0).reasons, ["No qualifying standings or earned positions"]);
});

test("check freshness compares revisions and equivalent timestamp formats", () => {
  const check = { source_revision: "12", rule_updated_at: "2026-10-07T09:00:00+00:00" };
  assert.equal(qualificationCheckIsCurrent(check, 12, "2026-10-07T09:00:00.000Z"), true);
  assert.equal(qualificationCheckIsCurrent(check, 13, "2026-10-07T09:00:00Z"), false);
  assert.equal(qualificationCheckIsCurrent(check, 12, undefined), false);
});
