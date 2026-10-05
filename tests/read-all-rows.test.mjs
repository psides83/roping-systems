import test from "node:test";
import assert from "node:assert/strict";
import { readAllRows } from "../src/lib/supabase/read-all-rows.ts";

test("public reads retain rows beyond the API's first page", async () => {
  const source = Array.from({ length: 2180 }, (_, id) => ({ id }));
  const ranges = [];
  const rows = await readAllRows((first,last) => {
    ranges.push([first,last]);
    return Promise.resolve({data:source.slice(first,last+1),error:null});
  },"Round results");
  assert.deepEqual(rows,source);
  assert.equal(ranges.length,5);
});
test("empty and exact-page responses finish without duplicating rows", async () => {
  for (const count of [0,500,1000]) {
    const source = Array.from({length:count},(_,id) => id);
    assert.deepEqual(await readAllRows((first,last) => Promise.resolve({data:source.slice(first,last+1),error:null}),"Results"),source);
  }
});
test("a failed later page does not return incomplete results", async () => {
  await assert.rejects(readAllRows(first => Promise.resolve(first===0 ? {data:Array(500).fill(1),error:null} : {data:null,error:{message:"Unavailable"}}),"Results"),/Results: Unavailable/);
});
