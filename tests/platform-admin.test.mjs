import test from "node:test";
import assert from "node:assert/strict";
import { accountAvailable, directoryFilters, accountStatuses, onboardingTasks } from "../src/lib/platform-admin.ts";

test("only active and setup accounts allow producer workspace access", () => {
  for (const status of Object.keys(accountStatuses)) assert.equal(accountAvailable(status), ["active", "setup"].includes(status));
  assert.equal(accountAvailable("unknown"), false);
});
test("directory filters reject invalid statuses and normalize pagination", () => {
  assert.deepEqual(directoryFilters({ q: "  Calf ropers  ", status: "pending", page: "2" }), { q: "Calf ropers", status: "pending", page: 2 });
  assert.deepEqual(directoryFilters({ status: "__proto__", q: ["not", "text"], page: "-1" }), { q: "", status: "", page: 1 });
  assert.equal(directoryFilters({ page: "9999999999" }).page, 100000);
  assert.equal(directoryFilters({ q: "a".repeat(200) }).q.length, 100);
});
test("onboarding reviews have seven distinct, stable tasks", () => {
  assert.equal(Object.keys(onboardingTasks).length, 7);
  assert.ok(onboardingTasks.owner);
  assert.ok(onboardingTasks.launch);
});
