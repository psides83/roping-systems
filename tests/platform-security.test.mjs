import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("platform reads and every management action require verified owner access", () => {
  assert.match(read("src/lib/platform-admin-data.ts"), /isVerifiedPlatformOwner\(\).*redirect\("\/auth\/platform-security"\)/);
  const actions = read("src/app/platform/actions.ts");
  assert.equal((actions.match(/if \(!await isVerifiedPlatformOwner\(\)\)/g) || []).length, 2);
  assert.match(read("src/app/onboarding/actions.ts"), /if \(!await isVerifiedPlatformOwner\(\)\)/);
});
test("database owner privileges require both trusted identity and signed assurance", () => {
  const sql = read("supabase/migrations/20261011180000_platform_owner_mfa.sql");
  assert.match(sql, /is_platform_owner_identity\(\) and coalesce\(auth.jwt\(\)->>'aal'='aal2',false\)/);
  assert.match(sql, /unique\(user_id,session_id\)/);
  assert.match(sql, /using\(public.is_platform_owner\(\)\)/);
});
test("authenticator codes use text input and secrets are not persisted", () => {
  const ui = read("src/components/platform/authenticator.tsx");
  assert.match(ui, /inputMode="numeric" autoComplete="one-time-code"/);
  assert.match(ui, /challengeAndVerify/);
  assert.doesNotMatch(ui, /localStorage|sessionStorage|console\.log|type="number"/);
  assert.match(ui, /currentLevel !== "aal2"/);
  assert.match(ui, /factor.status !== "verified"/);
});
