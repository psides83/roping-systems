import test from "node:test";
import assert from "node:assert/strict";
import { healthQuery, healthFilters } from "../src/lib/platform-health.ts";
test("health filters are bounded and reject unexpected values", () => {
  assert.deepEqual(healthQuery({filter:"setup",page:"2"}),{filter:"setup",page:2});
  assert.deepEqual(healthQuery({filter:"__proto__",page:"-1"}),{filter:"",page:1});
  assert.deepEqual(healthQuery({filter:["approval"],page:"abc"}),{filter:"",page:1});
  assert.equal(healthQuery({page:"999999999"}).page,100000);
  assert.equal(Object.keys(healthFilters).length,5);
});
