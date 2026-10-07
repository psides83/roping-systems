import test from "node:test";
import assert from "node:assert/strict";
import { producerAccessRole } from "../src/lib/staff-permissions.ts";

test("specialized and unknown roles never inherit broad producer write access", () => {
  for (const role of ["timing_staff", "viewer", "entry_office", "event_manager", "treasurer", "unexpected", ""]) {
    assert.equal(producerAccessRole(role), "viewer");
  }
  for (const role of ["owner", "admin", "operator"]) assert.equal(producerAccessRole(role), role);
});
