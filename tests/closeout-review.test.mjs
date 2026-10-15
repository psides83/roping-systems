import test from "node:test";
import assert from "node:assert/strict";
import { closeoutReview } from "../src/lib/events/closeout-review.ts";
import { reconciliationTotals } from "../src/lib/events/reconciliation.ts";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const complete = [{ event_day_status: "completed", payouts_finalized_at: "2026-10-15" }];
function review(totals = {}, values = {}) {
  return closeoutReview({ eventId: "event", totals: { ...reconciliationTotals([], [], [], [], new Set()), ...totals }, ropings: complete, sponsorCommitted: 0, sponsorReceived: 0, ...values });
}
test("matched payment records still flag outstanding charges, winnings, and acknowledgments", () => {
  const items = review({ outstanding: 10000, remainingAwards: 20000, unconfirmed: 5000 });
  assert.deepEqual(items.map(item => item.id), ["entry-balances", "award-balances", "acknowledgments"]);
  assert.equal(items[0].href, "/events/event/entries#entry-ledger");
  assert.match(items[1].detail, /Finalize payouts before recording/);
  assert.match(items[2].detail, /does not record another payment/);
});
test("signed discrepancies produce positive review amounts with accurate direction", () => {
  for (const difference of [-500, 500]) {
    const item = review({ collectionDifference: difference })[0];
    assert.equal(item.amountCents, 500);
    assert.match(item.detail, difference < 0 ? /receipts exceed fees/ : /collected exceed recorded/);
  }
  const items = review({ payoutDifference: -300, changedAwards: 1 });
  assert.equal(items[0].amountCents, 300);
  assert.match(items[1].title, /1 overpaid award$/);
});
test("unfinished competition, finalization and pledges have distinct next steps", () => {
  const items = review({}, { ropings: [{ event_day_status: "in_progress", payouts_finalized_at: null }], sponsorCommitted: 10000, sponsorReceived: 6000 });
  assert.deepEqual(items.map(item => item.id), ["competition", "finalization", "sponsors"]);
  assert.equal(items[0].href, "/events/event/arenas");
  assert.equal(items[1].href, "/events/event/payouts#payout-finalization");
  assert.equal(items[2].amountCents, 4000);
  assert.equal(review({}, { sponsorCommitted: 10000, sponsorReceived: 10000 }).length, 0);
});
test("zero balances do not imply an empty event is closed", () => {
  assert.deepEqual(review(), []);
  const empty = review({}, { ropings: [] });
  assert.equal(empty[0].id, "schedule");
  assert.match(empty[0].detail, /Zero balances alone/);
});
test("closeout review renders actionable links and a qualified clear state", () => {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL("../src/components/events/closeout-review.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => name === "next/link" ? { default: ({ children, ...props }) => React.createElement("a", props, children) } : name === "@/lib/utils" ? { formatCurrencyExact: cents => `$${(cents / 100).toFixed(2)}` } : require(name), compiled, compiled.exports);
  const Component = compiled.exports.CloseoutReview;
  const html = renderToStaticMarkup(React.createElement(Component, { items: review({ outstanding: 10000 }) }));
  assert.match(html, /1 review item/);
  assert.match(html, /href="\/events\/event\/entries#entry-ledger"/);
  assert.match(html, /\$100.00/);
  const clear = renderToStaticMarkup(React.createElement(Component, { items: [] }));
  assert.match(clear, /No review items found/);
  assert.match(clear, /physical cash/);
  assert.doesNotMatch(clear, /Event closed|Ready to close/);
});
