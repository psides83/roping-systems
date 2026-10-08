import test from "node:test";
import assert from "node:assert/strict";
import { authDestination } from "../src/lib/auth-destination.ts";

test("staff invitation authentication returns to invitation acceptance", () => {
  assert.equal(authDestination("/staff-invitations"), "/staff-invitations");
});

test("request management sign-in returns to the roper request list", () => {
  assert.equal(authDestination("/roper/requests"), "/roper/requests");
});

test("membership application sign-in returns to receipt linking", () => {
  assert.equal(authDestination("/roper/memberships"), "/roper/memberships");
});

test("authentication cannot redirect to external URLs or arbitrary paths", () => {
  for (const value of [undefined, null, "https://evil.example", "//evil.example", "/\\evil.example", "/auth/callback", ["/staff-invitations"]]) {
    assert.equal(authDestination(value), "/dashboard");
  }
});
