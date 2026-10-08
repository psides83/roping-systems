import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizeOnlineEntryOptions } from "../src/lib/online-entry-summary.ts";
const require = createRequire(import.meta.url);

function load(file, name, { state = {}, confirming = false } = {}) {
  const loaded = { exports: {} };
  const source = transpileModule(readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)((id) => {
    if (id === "react") return { ...React, useActionState: () => [state, undefined, false], useState: confirming ? () => [true, () => {}] : React.useState };
    if (id === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (id.endsWith("/actions")) return { submitOnlineEntry: () => {}, updateOnlineEntryRequest: () => {}, withdrawOnlineEntryRequest: () => {} };
    if (id.endsWith("online-entry-summary")) return { summarizeOnlineEntryOptions };
    if (id.endsWith("utils")) return { formatCurrency: (cents) => `$${(cents / 100).toFixed(2)}` };
    if (id.endsWith("phone-input")) return { PhoneInput: ({ defaultValue, name }) => React.createElement("input", { name, defaultValue }) };
    if (id.endsWith("qualification-notice")) return { qualificationNoticeText: () => "Qualification required" };
    return require(id);
  }, loaded, loaded.exports);
  return loaded.exports[name];
}

const request = { id: "request", revision: 3, firstName: "Cole", lastName: "Martin", email: "cole@example.com", phone: "(940) 555-0123", competitionGender: "male", birthDate: "1990-04-01", memberNumber: "123", note: "Original note", items: [{ id: "roping", quantity: 2, optionIds: ["side-pot"] }] };
const divisions = [{ id: "roping", name: "#11.5 Tie-down", maximumEntries: 2, allowGuests: false, eligibilityType: "skill", requiredFees: [], estimatedFirstEntryCents: 30000, options: [{ id: "side-pot", title: "Side Pot", amountCents: 5000, kind: "side_pot", scope: "entry" }] }];

test("editing prefills selections, quantities, optional pots and notes without editing identity", () => {
  const Form = load("events/online-entry-form", "OnlineEntryForm");
  const html = renderToStaticMarkup(React.createElement(Form, { producerSlug: "producer", eventSlug: "event", allowGuests: false, divisions, existingRequest: request }));
  assert.match(html, /Save changes/);
  assert.match(html, /name="quantity-roping" value="2"/);
  assert.match(html, /name="option-roping"[^>]*checked/);
  assert.match(html, /Original note/);
  assert.match(html, /value="Cole"/);
  assert.match(html, /<fieldset disabled/);
  assert.match(html, /Contact the producer if they need correcting/);
  assert.match(html, /\$100\.00/);
});

test("request editing and withdrawals have compact actions and an explicit confirmation", () => {
  const Actions = load("roper/online-entry-request-actions", "OnlineEntryRequestActions");
  const props = { requestId: "request", revision: 3, producerSlug: "producer", eventSlug: "event" };
  const html = renderToStaticMarkup(React.createElement(Actions, props));
  assert.match(html, /enter\?request=request/);
  assert.match(html, /Edit request/);
  assert.match(html, /Withdraw/);
  assert.doesNotMatch(html, /Confirm withdrawal/);
  const Confirm = load("roper/online-entry-request-actions", "OnlineEntryRequestActions", { confirming: true });
  const confirmation = renderToStaticMarkup(React.createElement(Confirm, props));
  assert.match(confirmation, /Confirm withdrawal/);
  assert.match(confirmation, /name="revision" value="3"/);
  assert.match(confirmation, /Keep request/);
  assert.match(confirmation, /history will remain available/);
});

test("successful saves and withdrawals replace their controls with a receipt", () => {
  const Form = load("events/online-entry-form", "OnlineEntryForm", { state: { success: true, message: "Saved" } });
  const html = renderToStaticMarkup(React.createElement(Form, { producerSlug: "producer", eventSlug: "event", allowGuests: false, divisions, existingRequest: request }));
  assert.match(html, /Entry request updated/);
  assert.match(html, /href="\/roper\/requests"/);
  assert.doesNotMatch(html, /Save changes/);
  const Actions = load("roper/online-entry-request-actions", "OnlineEntryRequestActions", { state: { success: true, message: "Request withdrawn" } });
  const receipt = renderToStaticMarkup(React.createElement(Actions, { requestId: "request", revision: 3, producerSlug: "producer", eventSlug: "event" }));
  assert.match(receipt, /Request withdrawn/);
  assert.doesNotMatch(receipt, /Edit request/);
});
