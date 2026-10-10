import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { feeCollectionAllocations } from "../src/lib/events/fee-collections.ts";
const compiled = {};
const source = ts.transpileModule(readFileSync(new URL("../src/lib/events/profitability.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "exports", source)(name => {
  assert.equal(name, "./fee-collections");
  return { feeCollectionAllocations };
}, compiled);
const { eventProfitability } = compiled;

const fee = (kind, amount, roping = "r") => ({ kind, event_roping_id: roping, collected_cents: amount, outstanding_cents: 0 });
const ropings = [{ id: "r", name: "Open", event_day_status: "completed", payouts_finalized_at: "2026-10-10" }];
const expense = (amount, roping = null) => ({ amount_cents: amount, event_roping_id: roping, voided_at: null });
test("practice runs and scores are event income, never competition purses or roping income", () => {
  const fees = [fee("stock_charge_run",12500,null),fee("stock_charge_score",1500,null)];
  const result = eventProfitability(fees,[],[],[],[expense(3000)],ropings);
  assert.deepEqual(feeCollectionAllocations(fees), {nonPayoutFees:14000,payoutFees:0,fundContributions:0});
  assert.equal(result.total.nonPayoutFeesAfterExpenses,11000);
  assert.equal(result.total.netRetained,11000);
  assert.equal(result.ropings[0].collected,0);
});
test("non-payout fees include operating charges, never payout pots or fund contributions", () => {
  const fees = [
    {...fee("standard",10000),contributes_to_payout:false,title:"Production charge"},
    {...fee("standard","1500"),contributes_to_payout:false,title:"Stock charge"},
    {...fee("standard",2000,null),contributes_to_payout:false,title:"Office charge"},
    {...fee("standard",30000),contributes_to_payout:true,title:"Jackpot"},
    {...fee("side_pot",5000),contributes_to_payout:false},
    {...fee("insurance",5000),contributes_to_payout:false},
    {...fee("added_money",1500),contributes_to_payout:true},
    {...fee("standard",0),contributes_to_payout:false,outstanding_cents:99999},
  ];
  assert.deepEqual(feeCollectionAllocations(fees),{nonPayoutFees:13500,payoutFees:40000,fundContributions:1500});
  const result=eventProfitability(fees,[],[],[],[expense(3000),expense(1000,"r"),{...expense(99999),voided_at:"2026-10-10"}],ropings);
  assert.equal(result.total.nonPayoutFees,13500);
  assert.equal(result.total.nonPayoutFeesAfterExpenses,9500);
  assert.equal(result.ropings[0].nonPayoutFees,11500);
  assert.equal(result.ropings[0].nonPayoutFeesAfterExpenses,10500);
  assert.equal(result.total.collected,result.total.nonPayoutFees+result.total.payoutFees+result.total.fundContributions);
});
test("expense coverage remains live and can show a loss before payouts are final",()=>{
  const result=eventProfitability([fee("standard",1000)],[],[],[],[expense(2000)], [{...ropings[0],event_day_status:"scheduled"}]);
  assert.equal(result.total.nonPayoutFeesAfterExpenses,-1000);
  assert.equal(result.total.netRetained,null);
});
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
