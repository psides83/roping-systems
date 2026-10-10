import test from "node:test";
import assert from "node:assert/strict";
import { eventProfitability } from "../src/lib/events/profitability.ts";

const fee = (kind, amount, roping = "r") => ({ kind, event_roping_id: roping, collected_cents: amount, outstanding_cents: 0 });
const ropings = [{ id: "r", name: "Open", event_day_status: "completed", payouts_finalized_at: "2026-10-10" }];
const expense = (amount, roping = null) => ({ amount_cents: amount, event_roping_id: roping, voided_at: null });
test("fund contributions are not profit; unpaid awards are still obligations", () => {
  const result = eventProfitability([fee("standard",100000),fee("added_money",10000),fee("standard",20000,null)], [], [], [{event_roping_id:"r",payout_cents:80000,paid_cents:10000}], [expense(15000),expense(5000,"r")], ropings);
  assert.equal(result.total.netRetained,20000);
  assert.equal(result.total.payoutRemaining,70000);
  assert.equal(result.ropings[0].netRetained,15000);
  assert.equal(result.sharedExpenses,15000);
});
test("only received sponsor money and actual net fund debits offset awards", () => {
  const result = eventProfitability([fee("standard",50000)], [{event_roping_id:"r",source:"sponsor",amount_cents:30000,received_cents:10000,cancelled_at:null},{event_roping_id:"r",source:"fund",amount_cents:99999,received_cents:99999,cancelled_at:null}], [{event_roping_id:"r",kind:"roping_allocation",amount_cents:-20000},{event_roping_id:"r",kind:"roping_return",amount_cents:5000},{event_roping_id:"r",kind:"entry_deposit",amount_cents:99999}], [{event_roping_id:"r",payout_cents:60000,paid_cents:60000}], [], ropings);
  assert.equal(result.total.netRetained,15000);
  assert.equal(result.total.fundMoneyUsed,15000);
  assert.equal(result.total.sponsorOutstanding,20000);
});
test("unfinished or unfinalized ropings never show final retained income", () => {
  for(const value of [{...ropings[0],event_day_status:"scheduled"},{...ropings[0],payouts_finalized_at:null}]) {
    assert.equal(eventProfitability([fee("standard",10000)],[],[],[],[],[value]).total.netRetained,null);
  }
});
test("removed expenses and cancelled sponsors are excluded", () => {
  const report=eventProfitability([fee("standard",10000)],[{event_roping_id:"r",source:"sponsor",amount_cents:5000,received_cents:5000,cancelled_at:"2026-10-10"}],[],[],[{...expense(5000),voided_at:"2026-10-10"}],ropings);
  assert.equal(report.total.netRetained,10000);
});
