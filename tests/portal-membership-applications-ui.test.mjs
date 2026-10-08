import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getStandardMembershipField } from "../src/lib/membership-forms.ts";
const require = createRequire(import.meta.url);
function load(file, name, state = {}) {
  const loaded = { exports: {} };
  const source = transpileModule(readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)((id) => {
    if (id === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (id === "react") return { ...React, useActionState: () => [state, undefined, false] };
    if (id.endsWith("/actions")) return {};
    if (id === "@/lib/membership-forms") return { getStandardMembershipField };
    if (id === "@/components/ui/phone-input") return { PhoneInput: ({ defaultValue, name }) => React.createElement("input", { name, defaultValue }) };
    if (id.endsWith("private-receipt-code")) return { PrivateReceiptCode: ({ code }) => React.createElement("textarea", { readOnly: true, value: code }) };
    return require(id);
  }, loaded, loaded.exports);
  return loaded.exports[name];
}
const Applications = load("roper/membership-applications", "MembershipApplications");
const Review = load("members/review-membership-application", "ReviewMembershipApplication");
const PublicForm = load("members/public-membership-form", "PublicMembershipForm");
const member = { id: "member", producerName: "Calf Roping Association", producerSlug: "calf-roping", memberNumber: "123", status: "active", expiresOn: "2027-04-30" };
test("published forms offer renewal against the existing member record", () => {
  const html = renderToStaticMarkup(React.createElement(Applications, { memberships: [member], data: { forms: [{ producerName: member.producerName, producerSlug: member.producerSlug }], applications: [] } }));
  assert.match(html, /membership\?member=member/); assert.match(html, /Expires 2027-04-30/); assert.match(html, /Request renewal/);
});
test("pending applications suppress duplicate renewal actions", () => {
  const html = renderToStaticMarkup(React.createElement(Applications, { memberships: [member], data: { forms: [{ producerName: member.producerName, producerSlug: member.producerSlug }], applications: [{ id: "application", ...member, kind: "renewal", status: "pending", submittedAt: "2026-10-08T12:00:00Z" }] } }));
  assert.match(html, /Awaiting review/); assert.doesNotMatch(html, /Request renewal/);
});
test("unpublished forms use producer contact rather than a broken renewal link", () => {
  const html = renderToStaticMarkup(React.createElement(Applications, { memberships: [member], data: { forms: [], applications: [] } }));
  assert.match(html, /Contact producer to renew/); assert.match(html, /No online membership forms/);
});
test("staff renewal review retains the record and asks for expiration", () => {
  const html = renderToStaticMarkup(React.createElement(Review, { id: "application", kind: "renewal", membershipId: "member", members: [] }));
  assert.match(html, /name="membershipId" value="member"/); assert.match(html, /New expiration date/); assert.doesNotMatch(html, /Choose verified member/);
});

test("new-member approval prefills the application and provides starting classifications", () => {
  const html = renderToStaticMarkup(React.createElement(Review, { id: "application", kind: "application", membershipId: null, members: [],
    responses: { first_name: "June", last_name: "Marshall", competition_gender: "Female", phone: "(940) 555-0123", city: "Glen Rose" },
    divisions: [{ id: "ba", name: "Breakaway", classifications: [{ id: "open", name: "Open" }] }] }));
  assert.match(html, /Create new member/); assert.match(html, /Use existing member/); assert.match(html, /value="June"/);
  assert.match(html, /Member number/); assert.match(html, /Breakaway classification/); assert.match(html, /value="female" selected/);
  assert.doesNotMatch(html, /Create member first/);
});
test("renewal prefills details but requires fresh release acceptance and signature", () => {
  const html = renderToStaticMarkup(React.createElement(PublicForm, { formId: "form", membershipId: "member", renewal: true,
    standardFields: [{ key: "first_name", required: true }, { key: "phone", required: true }], customSections: [],
    initialResponses: { first_name: "Cole", phone: "(940) 555-0123", acceptedRelease: true, signatureName: "Old signature" },
    releaseText: "Current producer release", requireSignature: true }));
  assert.match(html, /value="Cole"/); assert.match(html, /value="\(940\) 555-0123"/); assert.match(html, /Submit renewal/);
  assert.doesNotMatch(html, /checked=""/); assert.doesNotMatch(html, /Old signature/);
});

test("anonymous submission gives a private receipt and a sign-in path", () => {
  const Receipt = load("members/public-membership-form", "PublicMembershipForm", { success: true, receiptCode: "private-receipt-code" });
  const html = renderToStaticMarkup(React.createElement(Receipt, { formId: "form", standardFields: [], customSections: [], requireSignature: false, releaseText: null }));
  assert.match(html, /private-receipt-code/); assert.match(html, /90 days/); assert.match(html, /auth\/login\?next=\/roper\/memberships/);
  assert.doesNotMatch(html, /Submit application/);
});

test("approval success replaces the form with a link to the member", () => {
  const Saved = load("members/review-membership-application", "ReviewMembershipApplication", { success: true, membershipId: "member" });
  const html = renderToStaticMarkup(React.createElement(Saved, { id: "application", kind: "application", membershipId: null, members: [] }));
  assert.match(html, /Review saved/); assert.match(html, /href="\/members\/member"/); assert.doesNotMatch(html, /name="status"/);
});
