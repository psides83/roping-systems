import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
const require = createRequire(import.meta.url);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function load(path, react = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  const mocks = { react: { ...React, ...react }, "@/lib/utils": { formatCurrency: cents => `$${(cents / 100).toFixed(2)}` }, "@/lib/scoring": { formatFinalTimeAdjustment: String }, "next/link": { default: "a" } };
  new Function("require", "module", "exports", source)(name => mocks[name] ?? (name.endsWith("/actions") ? new Proxy({}, { get: () => () => {} }) : name.startsWith("@/") || name.startsWith("./") ? new Proxy({}, { get: (_, key) => key === "__esModule" ? true : key }) : require(name)), compiled, compiled.exports);
  return compiled.exports;
}
function contestant(id, paymentStatus = "unpaid") {
  return { personId: id, name: id, memberNumber: null, paymentStatus, totalCents: 10000, amountPaidCents: 0, balanceDueCents: 10000, payments: [], checkedIn: false, checkedInAt: null, charges: [], entries: [{ id: `${id}-entry`, division: "Breakaway", divisionId: "division", entryNumber: 1, paymentStatus, competitionStatus: "active", incentiveAdjustment: 0, options: [] }] };
}
function ledger({ search = "", payment = "all", arrival = "all", contestants = [contestant("Jace"), contestant("Mara", "paid_cash")], permissions = {} } = {}) {
  const values = [search, payment, arrival]; let index = 0;
  const { EntryLedger } = load("../src/components/events/entry-ledger.tsx", { useState: () => { const slot = index++; return [values[slot], next => { values[slot] = next; }]; }, useMemo: callback => callback() });
  const tree = EntryLedger({ eventId: "event", contestants, divisions: [], canEdit: false, ...permissions });
  return { tree, values, rows: nodes(tree, node => node.type?.name === "ContestantRow") };
}
test("ledger filters combine and can all be cleared without changing entries", () => {
  const people = [contestant("Jace"), { ...contestant("Mara", "paid_cash"), checkedIn: true }];
  const { tree, values, rows } = ledger({ search: "  breakaway  ", payment: "paid_cash", arrival: "checked_in", contestants: people });
  assert.deepEqual(rows.map(row => row.props.contestant.personId), ["Mara"]);
  nodes(tree, node => node.type === "button" && node.props.children === "Clear filters")[0].props.onClick();
  assert.deepEqual(values, ["", "all", "all"]);
  assert.equal(people.length, 2);
  const empty = ledger({ search: "no matching contestant" });
  assert.equal(empty.rows.length, 0);
  assert.ok(nodes(empty.tree, node => node.type === "td" && node.props.children === "No contestants match these filters.").length);
});
test("marked-paid entries are not described as recorded cash receipts", () => {
  for (const payments of [[], [{ id: "receipt", amountCents: 10000, voided: false }]]) {
    const person = { ...contestant("Mara", "paid_cash"), amountPaidCents: 10000, balanceDueCents: 0, payments };
    const { rows } = ledger({ contestants: [person] });
    const row = rows[0].type(rows[0].props);
    const paragraphs = nodes(row, node => node.type === "p").map(node => node.props.children);
    assert.ok(paragraphs.includes(payments.length ? "$100.00 cash recorded" : "Marked paid · No cash receipt recorded"));
    assert.ok(paragraphs.includes("No balance due"));
    assert.equal(nodes(row, node => node.type === "CashPaymentDialog").length, 1);
    assert.equal(nodes(row, node => node.type === "ContestantCheckInButton")[0].props.enabled, false);
  }
});
test("cash dialogs protect recording and voiding and keep the balance limit", () => {
  for (const recording of [false, true]) for (const voiding of [false, true]) {
    let index = 0;
    const { CashPaymentDialog } = load("../src/components/events/cash-payment-dialog.tsx", { useState: () => [index++ === 0 ? true : voiding, () => {}], useEffect() {}, useActionState: () => [{}, () => {}, recording] });
    const tree = CashPaymentDialog({ eventId: "event", personId: "person", contestantName: "Jace", balanceDueCents: 2500, payments: [], enabled: true });
    assert.equal(nodes(tree, node => node.type === "Dialog")[0].props.busy, recording || voiding);
    assert.equal(nodes(tree, node => node.type === "fieldset")[0].props.disabled, recording || voiding);
    const amount = nodes(tree, node => node.props?.name === "amount")[0];
    assert.equal(amount.props.max, "25.00");
    assert.equal(amount.props.min, "0.01");
  }
});
test("void completion or unmount clears the dialog busy state", () => {
  let index = 0; const effects = [], pendingStates = [];
  const { CashPaymentDialog } = load("../src/components/events/cash-payment-dialog.tsx", { useState: () => [index++ === 0, () => {}], useEffect: effect => effects.push(effect), useActionState: () => [{}, () => {}, true] });
  const tree = CashPaymentDialog({ eventId: "event", personId: "person", contestantName: "Jace", balanceDueCents: 0, payments: [{ id: "receipt", amountCents: 2500 }], enabled: true, canVoid: true });
  const voidForm = nodes(tree, node => node.type?.name === "VoidPaymentForm")[0];
  voidForm.type({ ...voidForm.props, onPendingChange: pending => pendingStates.push(pending) });
  const cleanup = effects.at(-1)();
  assert.deepEqual(pendingStates, [true]);
  cleanup();
  assert.deepEqual(pendingStates, [true, false]);
});
