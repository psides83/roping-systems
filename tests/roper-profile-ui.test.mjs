import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatProperNoun } from "../src/lib/utils.ts";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const loaded = { exports: {} };
  const code = transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", code)((id) => mocks[id] ?? (id.endsWith("/actions") ? {} : require(id)), loaded, loaded.exports);
  return loaded.exports;
}
const { roperContactSchema } = load("lib/roper-profile.ts", { "./utils": { formatProperNoun } });
const { ProfileForm } = load("components/roper/profile-form.tsx", {
  react: { ...React, useActionState: () => [{}, undefined, false] },
  "@/components/ui/phone-input": { PhoneInput: ({ defaultValue }) => React.createElement("input", { name: "phone", defaultValue }) },
});
const profile = { membershipId: "member", name: "Cole Smith", email: "cole@example.com", phone: "(940) 555-0123", city: "Fort Worth", state: "TX", birthDate: "1985-06-15", gender: "male", profileRevision: "revision", membershipRevision: "revision", corrections: [] };
test("contact schema normalizes location and validates phone formatting", () => {
  const values = { membership: "11111111-1111-4111-8111-111111111111", profileRevision: "revision", membershipRevision: "revision", email: "Cole@Example.com", phone: "(940) 555-0123", city: "fort worth", state: "tx" };
  const normalized = roperContactSchema.parse(values);
  assert.equal(normalized.city, "Fort Worth"); assert.equal(normalized.state, "TX"); assert.equal(normalized.email, "cole@example.com");
  assert.equal(roperContactSchema.safeParse({ ...values, phone: "123" }).success, false);
});
test("profile separates contact editing from staff-reviewed eligibility", () => {
  const html = renderToStaticMarkup(React.createElement(ProfileForm, { profile }));
  assert.match(html, /Contact email is separate from your sign-in email/);
  assert.match(html, /Classifications and membership status remain staff-managed/);
  assert.match(html, /Submit for staff review/);
  assert.doesNotMatch(html, /name="(?:classification|memberNumber|status)"/);
  assert.doesNotMatch(html, /<details[^>]* open/);
});
test("pending correction blocks duplicate form and shows request status", () => {
  const html = renderToStaticMarkup(React.createElement(ProfileForm, { profile: { ...profile, corrections: [{ id: "request", status: "pending", birthDate: "1986-06-15", reason: "Incorrect birthday" }] } }));
  assert.match(html, /awaiting producer review/);
  assert.doesNotMatch(html, /Submit for staff review/);
});
