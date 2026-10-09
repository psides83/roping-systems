import test from "node:test";
import assert from "node:assert/strict";
import { rolloverSchema, nextSeasonDates } from "../src/lib/season-rollover.ts";
const valid={reference:"00000000-0000-4000-8000-000000000001",sourceSeason:"00000000-0000-4000-8000-000000000002",name:"2027-2028",startsOn:"2027-05-01",endsOn:"2028-04-30",duesEnabled:true,assessMembers:false,copyQualifications:true,amountCents:10000,installments:true,allocationMode:"fixed",allocationValue:2000,fundId:"00000000-0000-4000-8000-000000000003"};
test("rollover supports cross-year seasons and leap-day boundaries",()=>{
  assert.deepEqual(nextSeasonDates("2026-05-01","2027-04-30"),{startsOn:"2027-05-01",endsOn:"2028-04-30"});
  assert.deepEqual(nextSeasonDates("2024-02-29","2025-02-28"),{startsOn:"2025-03-01",endsOn:"2026-02-28"});
});
test("rollover validates dues, allocation and required fund",()=>{
  assert.ok(rolloverSchema.safeParse(valid).success);
  for(const patch of [{endsOn:"2027-04-30"},{amountCents:0},{allocationValue:10001},{fundId:null},{allocationMode:"percent",allocationValue:10001},{reference:"not-a-uuid"}])
    assert.equal(rolloverSchema.safeParse({...valid,...patch}).success,false);
  assert.ok(rolloverSchema.safeParse({...valid,duesEnabled:false,amountCents:0,allocationValue:0,fundId:null}).success);
  assert.equal(rolloverSchema.safeParse({...valid,duesEnabled:false,assessMembers:true}).success,false);
});
