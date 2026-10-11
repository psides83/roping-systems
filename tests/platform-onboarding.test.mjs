import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { onboardingTasks } from "../src/lib/platform-admin.ts";

const source = ts.transpileModule(readFileSync(new URL("../src/lib/platform-onboarding.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function("require", "exports", source)((id) => {
  assert.equal(id, "./platform-admin");
  return { onboardingTasks };
}, loaded.exports);
const { onboardingReview } = loaded.exports;

const fixture = () => ({ tasks: [], setup: { divisions: 2, classifications: 8, templates: 4, payouts: 3, seasons: 1, members: 0 } });
test("configured data never automatically completes a review", () => {
  const review = onboardingReview(fixture());
  assert.equal(review.reviewed, 0);
  assert.equal(review.reviewComplete, false);
  assert.equal(review.next.key, "owner");
  assert.match(review.steps.find((s) => s.key === "records").signal, /0 roper records/);
});
test("next step follows incomplete reviews and ignores unknown or duplicate tasks", () => {
  const detail = fixture();
  detail.tasks = [{ task_key: "owner", completed_at: "2026-10-10T12:00:00Z" }, { task_key: "owner", completed_at: "2026-10-10T12:00:00Z" }, { task_key: "unknown", completed_at: "2026-10-10T12:00:00Z" }];
  const review = onboardingReview(detail);
  assert.equal(review.reviewed, 1);
  assert.equal(review.next.key, "divisions");
});
test("all reviews complete without requiring a preexisting roster", () => {
  const detail = fixture();
  detail.tasks = Object.keys(onboardingTasks).map((task_key) => ({ task_key, completed_at: "2026-10-10T12:00:00Z" }));
  const review = onboardingReview(detail);
  assert.equal(review.reviewComplete, true);
  assert.equal(review.next, null);
  assert.equal(review.total, 7);
  detail.tasks[2].completed_at = null;
  assert.equal(onboardingReview(detail).reviewComplete, false);
});
