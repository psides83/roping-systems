import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { eligibilityLabels } from "../src/lib/online-entry-eligibility.ts";

const require = createRequire(import.meta.url);
const loaded = { exports: {} };
const source = transpileModule(readFileSync(new URL("../src/components/events/entry-eligibility-feedback.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
new Function("require", "module", "exports", source)((id) => id.endsWith("online-entry-eligibility") ? { eligibilityLabels } : require(id), loaded, loaded.exports);

test("eligibility feedback distinguishes passed checks from producer review and restrictions", () => {
  for (const status of ["eligible", "review", "restricted"]) {
    const html = renderToStaticMarkup(React.createElement(loaded.exports.EntryEligibilityFeedback, { check: { event_roping_id: "roping", status, messages: status === "eligible" ? [] : ["Contact the producer"], remaining_entries: 1 } }));
    assert.ok(html.includes(eligibilityLabels[status]));
    assert.match(html, /1 entry available/);
    assert.equal(html.includes("Contact the producer"), status !== "eligible");
  }
});

test("feedback escapes producer messages and does not invent an unlimited entry count", () => {
  const html = renderToStaticMarkup(React.createElement(loaded.exports.EntryEligibilityFeedback, { check: { event_roping_id: "roping", status: "restricted", messages: ["<script>private</script>"], remaining_entries: null } }));
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /entries available/);
});

test("private eligibility preview requires verified ownership and does not insert entries", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261008100000_online_entry_eligibility_preview.sql", import.meta.url), "utf8");
  const rpc = sql.slice(sql.indexOf("create function public.my_online_entry_eligibility"));
  assert.match(rpc, /auth.uid\(\) is null/);
  assert.match(rpc, /public.owns_membership\(m.id\)/);
  assert.match(rpc, /publication_state='published'/);
  assert.match(rpc, /revoke all[^;]*from public,anon/);
  assert.doesNotMatch(rpc, /\b(insert into|update public\.|delete from)\b/i);
  for (const helper of ["entry_classification_failure", "member_fine_blocks", "membership_suspension_blocks", "standings_qualification_failure", "roping_entry_allowance"]) assert.ok(rpc.includes(`public.${helper}`));
});
