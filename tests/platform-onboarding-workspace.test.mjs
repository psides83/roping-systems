import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { onboardingTasks } from "../src/lib/platform-admin.ts";
const source = ts.transpileModule(readFileSync(new URL("../src/lib/platform-onboarding-workspace.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function("require", "exports", source)(() => ({ onboardingTasks }), loaded.exports);
const { onboardingWorkspaceFilters, onboardingNextAction } = loaded.exports;
test("onboarding filters default to setup and keep paging bounded", () => {
  assert.deepEqual(onboardingWorkspaceFilters({}), { view: "setup", q: "", page: 1 });
  assert.deepEqual(onboardingWorkspaceFilters({ view: "all", q: " test ", page: "2" }), { view: "all", q: "test", page: 2 });
  assert.equal(onboardingWorkspaceFilters({ view: "invalid", page: "9999999" }).page, 100000);
});
test("next action separates contacts, approval, review, and activation", () => {
  const row = { status: "setup", contact_name: "Jane Doe", completed_tasks: 0 };
  assert.equal(onboardingNextAction({ ...row, contact_name: null }).tab, "contacts");
  assert.equal(onboardingNextAction({ ...row, status: "pending" }).label, "Review account approval");
  assert.equal(onboardingNextAction(row).tab, "onboarding");
  assert.equal(onboardingNextAction({ ...row, completed_tasks: 7 }).label, "Review activation");
  assert.equal(onboardingNextAction({ ...row, status: "archived", contact_name: null }).tab, "account");
});
