import { test } from "node:test";
import assert from "node:assert/strict";
import { moveBackStatus, isMoveBackTarget } from "../src/lib/classification-move-back.ts";

const progress = { enabled: true, hasMove: true, eligible: false, exceptionReason: null, previousClassificationId: "15" };
test("move-back status distinguishes disabled, initial, waiting, eligible and exceptions", () => {
  assert.equal(moveBackStatus({ ...progress, enabled: false }), "Off");
  assert.equal(moveBackStatus({ ...progress, hasMove: false }), "No prior move");
  assert.equal(moveBackStatus(progress), "Waiting");
  assert.equal(moveBackStatus({ ...progress, eligible: true }), "Eligible for review");
  assert.equal(moveBackStatus({ ...progress, exceptionReason: "Staff approved" }), "Staff exception");
});
test("previous classes and weaker numbered classes are move-back targets, not open or stronger numbers", () => {
  assert.equal(isMoveBackTarget(progress, { id: "15" }), true);
  assert.equal(isMoveBackTarget(progress, { id: "13", classificationNumber: 13 }, 11.5), true);
  assert.equal(isMoveBackTarget(progress, { id: "10", classificationNumber: 10 }, 11.5), false);
  assert.equal(isMoveBackTarget(progress, { id: "open", classificationNumber: 0 }, 11.5), false);
});
