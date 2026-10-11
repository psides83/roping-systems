import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function renderDialog({ guest = false, requireMemberships = true, pending = false, selectedIds = [], gender = "", canApproveMemberships = false } = {}) {
  let stateIndex = 0;
  const loaded = { exports: {} };
  const source = transpileModule(readFileSync(new URL("../src/components/events/entry-form-dialog.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", source)(id => {
    if (id === "react") return { ...React, useActionState: () => [{}, undefined, pending], useState: initial => {
      const value = stateIndex === 0 ? true : stateIndex === 4 ? selectedIds : stateIndex === 5 ? gender : initial === "member" && guest ? "guest" : initial;
      stateIndex += 1;
      return React.useState(value);
    } };
    if (id.endsWith("/actions")) return { addWalkUpEntries: () => {}, walkUpEligibility: async () => ({ rows: [] }) };
    if (id.endsWith("utils")) return { cn: (...values) => values.join(" "), formatCurrency: cents => `$${cents / 100}`, formatPhoneNumber: phone => phone };
    if (id.endsWith("phone-input")) return { PhoneInput: props => React.createElement("input", { name: "phone", type: "tel", ...props }) };
    return (id === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(id));
  }, loaded, loaded.exports);
  return renderToStaticMarkup(React.createElement(loaded.exports.EntryFormDialog, {
    eventId: "event", requireMemberships, canApproveMemberships, ropers: [], divisions: [
      { id: "roping-a", name: "Open Tie-down", allowGuests: true, options: [] },
      { id: "roping-b", name: "Open Breakaway", allowGuests: true, options: [] },
      { id: "roping-c", name: "Members only", allowGuests: false, options: [] },
      { id: "roping-age", name: "19 and under", allowGuests: true, requiresBirthDate: true, options: [] },
      { id: "roping-male-age", name: "Breakaway age exception", allowGuests: true, requiresMaleBirthDate: true, options: [] },
    ],
  }));
}

test("membership-required entry office offers new roper registration and existing roper search", () => {
  const html = renderDialog();
  assert.match(html, /Search ropers by name, number, or phone/);
  assert.match(html, /New roper/);
  assert.match(html, /Select a roper to see eligible ropings/);
  assert.match(html, /<button disabled=""[^>]*>Add entries/);
  assert.doesNotMatch(html, /animate-spin/);
});

test("guest office registration requires phone, not email, and selects multiple ropings", () => {
  const html = renderDialog({ guest: true, requireMemberships: false });
  assert.match(html.match(/<input[^>]*name="phone"[^>]*>/)?.[0] ?? "", /required/);
  assert.doesNotMatch(html.match(/<input[^>]*name="email"[^>]*>/)?.[0] ?? "", /required/);
  assert.match(html, /name="divisionIds"[^>]*value="roping-a"/);
  assert.match(html, /name="divisionIds"[^>]*value="roping-b"/);
  assert.match(html, /Members only/);
  assert.doesNotMatch(html, /animate-spin/);
});

test("only membership managers can approve a paper application during registration", () => {
  const office = renderDialog({ guest: true });
  assert.match(office, /name="membershipApproval" value="pending"/);
  assert.match(office, /cannot compete until membership approval/);
  assert.doesNotMatch(office, /Paper application approved/);
  const manager = renderDialog({ guest: true, canApproveMemberships: true });
  assert.match(manager, /Paper application approved/);
  assert.match(manager, /Approval pending/);
});

test("only a real save displays the saving indicator", () => {
  const html = renderDialog({ pending: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Saving entries/);
  assert.match(html, /animate-spin/);
});

test("birth date is required only for selected age eligibility or applicable male exceptions", () => {
  const birthday = options => renderDialog({ guest: true, requireMemberships: false, ...options }).match(/<input[^>]*name="birthDate"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(birthday({ selectedIds: ["roping-a"] }), /required/);
  assert.match(birthday({ selectedIds: ["roping-a", "roping-age"] }), /required/);
  assert.match(birthday({ selectedIds: ["roping-male-age"], gender: "male" }), /required/);
  assert.doesNotMatch(birthday({ selectedIds: ["roping-male-age"], gender: "female" }), /required/);
});
