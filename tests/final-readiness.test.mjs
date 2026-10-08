import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeReadiness } from "../src/lib/events/final-readiness.ts";

const ready = { id: "roping", name: "#11 Tie-down", pending: 0, reruns: 0, shortRoundIssue: false, payoutIssues: [] };
test("Resolved competition is ready", () => assert.equal(summarizeReadiness([ready]).blocked, false));
test("Pending runs block completion", () => assert.equal(summarizeReadiness([{ ...ready, pending: 2 }]).blocked, true));
test("Required reruns block official results", () => assert.equal(summarizeReadiness([{ ...ready, reruns: 1 }]).blocked, true));
test("Unbuilt or unlocked required short round blocks completion", () => assert.equal(summarizeReadiness([{ ...ready, shortRoundIssue: true }]).blocked, true));
test("Payout warnings do not prevent results publication", () => assert.equal(summarizeReadiness([{ ...ready, payoutIssues: ["Not finalized"] }]).blocked, false));
test("Event totals include all ropings", () => {
  const result = summarizeReadiness([{ ...ready, pending: 3 }, { ...ready, id: "another", pending: 1, reruns: 2 }]);
  assert.equal(result.pending, 4); assert.equal(result.reruns, 2);
});
test("Both final actions recheck readiness on the server", () => {
  for (const file of ["actions.ts", "result-actions.ts"]) {
    const source = readFileSync(new URL(`../src/app/(app)/events/[eventId]/${file}`, import.meta.url), "utf8");
    assert.match(source, /await getFinalReadiness\(eventId/);
    assert.match(source, /readiness\.summary\.blocked/);
  }
});
