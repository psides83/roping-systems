import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateFinalsQualifications } from "../src/lib/finals-qualifications.ts";
import { finalsPositionSlots } from "../src/lib/finals-position-assignments.ts";

const require = createRequire(import.meta.url);
function load(path, imports = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", source)((name) => imports[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const { roperBonusPositions } = load("../src/lib/roper-bonus-positions.ts", {
  "./finals-qualifications": { calculateFinalsQualifications }, "./finals-position-assignments": { finalsPositionSlots },
});
const { PortalBonusPositions } = load("../src/components/roper/portal-bonus-positions.tsx", {
  "@/lib/roper-bonus-positions": { roperBonusPositions }, "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
});
const manual = (id, memberId = "member", extra = {}) => ({ id, memberId, producerId: "producer", seasonId: "season", classId: "11", date: "2026-06-01", positions: 2, reason: "Staff award", revoked: false, ...extra });
const fixture = () => ({ memberId: "member", producerId: "producer", today: "2026-10-07", season: { id: "season", name: "2026/27", startsOn: "2026-05-01", endsOn: "2027-04-30" }, seasons: [{ id: "season", name: "2026/27" }], source: { rules: [], finishes: [], manual: [manual("own"), manual("other", "anonymous-other")], moves: [], decisions: [] }, assignments: [], classes: { 11: "#11 Tie-down", 10: "#10 Tie-down" }, ropings: [{ id: "finals", name: "#11 Tie-down", date: "2027-05-01", eventTitle: "Finals", eventSlug: "finals", public: true }] });
const assignment = { id: "assignment", award_key: "manual:own", position_number: 1, event_roping_id: "finals", assigned_class_key: "11", assigned_at: "2026-06-01", reason: "" };
test("portal shows only its member's positions with assigned and pending states", () => {
  const data = fixture(); data.assignments = [assignment];
  const slots = roperBonusPositions(data);
  assert.deepEqual(slots.map(x => x.status), ["assigned", "pending"]);
  assert.equal(slots[0].targetRoping.eventTitle, "Finals");
  assert.equal(slots.length, 2);
});
test("pending positions expire and assigned positions remain attached after season end", () => {
  const data = fixture(); data.assignments = [assignment]; data.today = "2027-05-01";
  assert.deepEqual(roperBonusPositions(data).map(x => x.status), ["assigned", "expired"]);
});
test("transferred classes require review and revoked positions no longer show", () => {
  const data = fixture(); data.assignments = [assignment];
  data.source.moves = [{ id: "move", producerId: "producer", seasonId: "season", memberId: "member", fromClassId: "11", toClassId: "10", date: "2026-07-01", decision: "transfer", reason: "Staff decision" }];
  assert.equal(roperBonusPositions(data)[0].status, "needs_review");
  data.source.moves[0].decision = "revoke";
  assert.deepEqual(roperBonusPositions(data), []);
});
test("anonymous competitors remain part of pass-down calculations", () => {
  const data = fixture();
  data.source.manual = [manual("other", "anonymous-other", { positions: 1 })];
  const rule = { id: "rule", producerId: "producer", seasonId: "season", classId: "11", ropingId: "qualifier", stage: "aggregate", round: null, places: [{ place: 1, positions: 1 }], repeatPolicy: "pass_down", tiePolicy: "all", maximumPositions: null };
  data.source.rules = [rule];
  data.source.finishes = [
    { ...rule, date: "2026-07-01", official: true, entryId: "anonymous-entry", memberId: "anonymous-other", place: 1 },
    { ...rule, date: "2026-07-01", official: true, entryId: "own-entry", memberId: "member", place: 2 },
  ];
  assert.equal(roperBonusPositions(data).length, 1);
});
test("portal controls are read-only, collapsed, and clear about extra entries", () => {
  const data = fixture(); data.assignments = [assignment];
  const html = renderToStaticMarkup(React.createElement(PortalBonusPositions, { data, producerSlug: "producer" }));
  assert.match(html, /one extra entry to your normal allowance/);
  assert.match(html, /Pending assignment/);
  assert.match(html, /Finals · #11 Tie-down/);
  assert.doesNotMatch(html, /Save assignment|Staff award|<details[^>]* open/);
  assert.match(html, /name="season"/);
});
test("no season and no awards have distinct empty states", () => {
  const data = fixture(); data.source = null; data.season = null; data.seasons = [];
  assert.deepEqual(roperBonusPositions(data), []);
  assert.match(renderToStaticMarkup(React.createElement(PortalBonusPositions, { data, producerSlug: "producer" })), /not set up a season yet/);
});
