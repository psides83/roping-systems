import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import * as register from "../src/lib/events/payout-register.ts";
const require = createRequire(import.meta.url);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function load(path, mocks) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? (name === "@/lib/utils" ? { formatCurrency: cents => `$${cents}` } : name.startsWith("@/") || name.startsWith("./") ? new Proxy({}, { get: (_, key) => key === "__esModule" ? true : key }) : require(name)), compiled, compiled.exports);
  return compiled.exports;
}
const award = values => ({ planId: "plan", ropingId: "a", ropingName: "Open", poolName: "Main", poolType: "main", entryId: "entry", roperId: "jace", name: "Jace", memberNumber: null, sectionType: "aggregate", round: null, dNumber: null, place: 1, awardKey: "award", amountCents: 1000, paidCents: 0, ...values });
function view({ values = ["", "", "all", [], null, ""], awards = [award({})], canManage = true } = {}) {
  let index = 0;
  const { PayoutRegister } = load("../src/components/events/payout-register.tsx", { react: { ...React, useState: () => { const slot = index++; return [values[slot], next => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; }, useTransition: () => [false, () => {}] }, "@/lib/events/payout-register": register });
  return { tree: PayoutRegister({ eventId: "event", awards, receipts: [], canManage }), values };
}
test("payout totals follow roping scope while search filters only the list", () => {
  const { tree, values } = view({ values: ["a", "  mara  ", "all", [], null, ""], awards: [award({}), award({ roperId: "mara", name: "Mara", amountCents: 500 }), award({ ropingId: "b", amountCents: 9000 })] });
  assert.equal(nodes(tree, node => node.props?.["aria-label"] === "Record payout for Jace").length, 0);
  assert.equal(nodes(tree, node => node.props?.["aria-label"] === "Record payout for Mara").length, 1);
  assert.ok(nodes(tree, node => node.type === "p" && node.props.children === "$1500").length);
  nodes(tree, node => node.type === "button" && node.props.children === "Clear filters")[0].props.onClick();
  assert.deepEqual(values.slice(0, 4), ["", "", "all", []]);
});
test("payout actions remain unavailable for viewers and overpaid awards", () => {
  for (const canManage of [false, true]) {
    const { tree } = view({ canManage, awards: [award({ paidCents: 1200 }), award({ awardKey: "second", amountCents: 500 })] });
    assert.equal(nodes(tree, node => node.props?.["aria-label"] === "Record payout for Jace").length, 0);
  }
  const { tree } = view({ canManage: false });
  assert.equal(nodes(tree, node => node.props?.["aria-label"] === "Record payout for Jace").length, 0);
});
test("payout dialog preserves retry identity and closes only after confirmed success", async () => {
  const calls = [], tasks = []; let closed = 0, response = { error: "Connection interrupted" };
  const { PayoutPaymentDialog } = load("../src/components/events/payout-payment-dialog.tsx", {
    react: { ...React, useState: initial => [typeof initial === "function" ? "stable-reference" : initial, () => {}], useTransition: () => [false, task => tasks.push(task())] },
    "@/app/(app)/events/[eventId]/payouts/actions": { recordRoperPayout: async (...args) => { calls.push(args); return response; } },
  });
  const tree = PayoutPaymentDialog({ eventId: "event", ropingId: "a", target: { roperId: "jace", name: "Jace", dueCents: 1000 }, onClose: () => closed++ });
  const submit = nodes(tree, node => node.type === "PersistentForm")[0].props.action;
  const amount = nodes(tree, node => node.props?.name === "amount")[0];
  assert.equal(amount.props.max, "10.00");
  submit(new FormData()); await Promise.all(tasks); assert.equal(closed, 0);
  response = {}; submit(new FormData()); await Promise.all(tasks);
  assert.equal(closed, 1);
  assert.deepEqual(calls.map(call => call[3]), ["stable-reference", "stable-reference"]);
});
test("pending payout and reversal forms retain dismissal and input guards", () => {
  for (const receiptId of [undefined, "receipt"]) {
    const { PayoutPaymentDialog } = load("../src/components/events/payout-payment-dialog.tsx", { react: { ...React, useState: initial => [typeof initial === "function" ? "reference" : initial, () => {}], useTransition: () => [true, () => {}] } });
    const tree = PayoutPaymentDialog({ eventId: "event", ropingId: null, target: { roperId: "jace", name: "Jace", dueCents: 1000, receiptId }, onClose() {} });
    assert.equal(tree.props.busy, true);
    assert.equal(nodes(tree, node => node.type === "fieldset")[0].props.disabled, true);
    assert.equal(nodes(tree, node => node.type === "button" && "data-dialog-close" in node.props)[0].props.disabled, true);
    if (receiptId) assert.equal(nodes(tree, node => node.props?.name === "reason")[0].props.required, true);
  }
});
