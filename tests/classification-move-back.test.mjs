import { test } from "node:test";
import assert from "node:assert/strict";
import { moveBackStatus, isMoveBackTarget, blocksMoveBack } from "../src/lib/classification-move-back.ts";

const progress = { enabled: true, hasMove: true, eligible: false, exceptionReason: null, previousClassificationId: "15" };
test("move-back status distinguishes disabled, initial, waiting, eligible and exceptions", () => {
  assert.equal(moveBackStatus({ ...progress, enabled: false }), "Off");
  assert.equal(moveBackStatus({ ...progress, hasMove: false }), "No prior move");
  assert.equal(moveBackStatus(progress), "Waiting");
  assert.equal(moveBackStatus({ ...progress, eligible: true }), "Eligible for review");
  assert.equal(moveBackStatus({ ...progress, exceptionReason: "Staff approved" }), "Staff exception");
});
test("dialog feedback blocks only restricted targets until participation or a staff exception allows review", () => {
  const waiting = { ...progress, classificationId: "11", moveBackTargetIds: ["13", "15"] };
  assert.equal(blocksMoveBack(waiting, "13"), true);
  assert.equal(blocksMoveBack(waiting, "15"), true);
  assert.equal(blocksMoveBack(waiting, "10"), false);
  assert.equal(blocksMoveBack(waiting, "11"), false);
  assert.equal(blocksMoveBack(waiting, ""), false);
  assert.equal(blocksMoveBack(undefined, "13"), false);
  assert.equal(blocksMoveBack({ ...waiting, enabled: false }, "13"), false);
  assert.equal(blocksMoveBack({ ...waiting, hasMove: false }, "13"), false);
  assert.equal(blocksMoveBack({ ...waiting, eligible: true }, "13"), false);
  assert.equal(blocksMoveBack({ ...waiting, exceptionReason: "Staff approved", eligible: true }, "13"), false);
});
test("previous classes and weaker numbered classes are move-back targets, not open or stronger numbers", () => {
  assert.equal(isMoveBackTarget(progress, { id: "15" }), true);
  assert.equal(isMoveBackTarget(progress, { id: "13", classificationNumber: 13 }, 11.5), true);
  assert.equal(isMoveBackTarget(progress, { id: "10", classificationNumber: 10 }, 11.5), false);
  assert.equal(isMoveBackTarget(progress, { id: "open", classificationNumber: 0 }, 11.5), false);
});
