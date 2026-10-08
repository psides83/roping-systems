// Rollback-only comparison of canonical and anonymized qualification sources.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { calculateFinalsQualifications } from "../src/lib/finals-qualifications.ts";
import { finalsPositionSlots } from "../src/lib/finals-position-assignments.ts";

const output = execFileSync("node_modules/.bin/supabase", ["db", "query", "--linked", "--file", "supabase/tests/roper-bonus-calculation.sql"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const result = JSON.parse(output);
const { canonical, portal } = result.rows[0].payload;
const calculate = (source) => calculateFinalsQualifications(source.rules, source.finishes, source.manual, source.moves ?? [], source.decisions ?? []);
const own = (source) => calculate(source).awards.filter((award) => award.memberId === portal.memberId);
assert.deepEqual(own(portal.source), own(canonical));
assert.ok(own(canonical).some((award) => !award.revoked));
assert.deepEqual(portal.source.profiles, []);
const opaque = new Set([...portal.source.manual, ...portal.source.moves, ...portal.source.finishes].map((row) => row.memberId));
for (const row of [...canonical.manual, ...(canonical.moves ?? []), ...canonical.finishes]) {
  if (row.memberId && row.memberId !== portal.memberId) assert.ok(!opaque.has(row.memberId), "Another member identity was exposed");
}
const slots = finalsPositionSlots(own(portal.source), portal.assignments, portal.season.endsOn, portal.today);
console.log(`Canonical and private portal awards match; ${slots.length} own bonus positions verified. All fixture changes rolled back.`);
