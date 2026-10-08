import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { producerAccessRole } from "../src/lib/staff-permissions.ts";

test("specialized and unknown roles never inherit broad producer write access", () => {
  for (const role of ["timing_staff", "viewer", "entry_office", "event_manager", "treasurer", "unexpected", ""]) {
    assert.equal(producerAccessRole(role), "viewer");
  }
  for (const role of ["owner", "admin", "operator"]) assert.equal(producerAccessRole(role), role);
});

test("short-round implementation helpers are not staff-callable", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20261008150000_private_short_round_helpers.sql", import.meta.url), "utf8");
  assert.match(migration, /revoke all on function public\.apply_short_round_settings\(uuid,uuid,boolean,jsonb\),\s*public\.apply_template_short_round_settings\(uuid\)\s*from public, anon, authenticated/);
});

test("event creation and duplication controls require broad producer write access", () => {
  const page = readFileSync(new URL("../src/app/(app)/events/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const canCreate = configured && Boolean\(producer && producer\.role !== "viewer"\)/);
  assert.match(page, /configured=\{canCreate\}/);
  assert.match(page, /canCreate && roping\.duplicationDraft/);
});
