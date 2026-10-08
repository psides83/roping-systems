import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateSeasonStandings, calculateQualificationStandings, UNRANKED_QUALIFICATION, qualifiesForStandings } from "../src/lib/season-standings.ts";
import { formatAccountMoney } from "../src/lib/roper-accounts.ts";
const require = createRequire(import.meta.url);
function load(path, imports) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 } }).outputText;
  new Function("require", "module", "exports", source)((name) => imports[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const { personalStandings } = load("../src/lib/roper-standings.ts", { "./season-standings": { calculateSeasonStandings, calculateQualificationStandings, UNRANKED_QUALIFICATION, qualifiesForStandings } });
const link = { default: ({ children, ...props }) => React.createElement("a", props, children) };
const { PortalStandings } = load("../src/components/roper/portal-standings.tsx", { "next/link": link, "@/lib/roper-accounts": { formatAccountMoney } });
const { PortalNavigation } = load("../src/components/roper/portal-navigation.tsx", { "next/link": link, "@/components/ui/navigation-pending": { NavigationPending: () => null } });
const context = () => ({ roperId: "own", producerSlug: "producer", season: { id: "season", name: "2026/27", startsOn: "2026-05-01", endsOn: "2027-04-30" }, seasons: [{ id: "season", name: "2026/27" }], currentClasses: ["11"], requirements: [] });
const source = () => ({ contributions: [], moves: [], classes: [{ id: "11", name: "#11", divisionName: "Tie-down" }, { id: "10", name: "#10", divisionName: "Tie-down" }], ropers: [] });
const contribution = (roperId, ropingId, winningsCents, extra = {}) => ({ roperId, ropingId, winningsCents, classId: "11", date: "2026-06-01", official: true, ...extra });
test("personal rows retain full-field rank and weighted attendance, but not other ropers", () => {
  const data = source(); data.contributions = [contribution("leader", "first", 10000), contribution("own", "first", 5000, { attendanceCount: 3 }), contribution("own", "second", 0), contribution("own", "third", 99999, { official: false })];
  const rows = personalStandings(context(), data);
  assert.equal(rows.length, 1); assert.equal(rows[0].rank, 2); assert.equal(rows[0].ropingsEntered, 4); assert.equal(rows[0].winningsCents, 5000);
});
test("requirements use cutoff attendance rather than the season total", () => {
  const member = context(); member.requirements = [{ classId: "11", topPlaces: 2, minimumRopings: 2, cutoffOn: "2026-06-30", attendanceCutoffOn: "2026-06-30" }];
  const data = source(); data.contributions = [contribution("own", "first", 100), contribution("own", "second", 100, { date: "2026-07-01" })];
  const row = personalStandings(member, data)[0];
  assert.equal(row.ropingsEntered, 2); assert.equal(row.qualifyingCount, 1); assert.equal(row.remainingRopings, 1); assert.equal(row.meetsRequirements, false);
});
test("class-move caps apply to earnings while attendance stays with the class entered", () => {
  const data = source(); data.contributions = [contribution("own", "first", 8000), contribution("leader", "second", 6000, { classId: "10" })];
  data.moves = [{ id: "move", roperId: "own", fromClassId: "11", toClassId: "10", date: "2026-07-01", capAtLeader: true, classLadder: ["11", "10"] }];
  const rows = personalStandings(context(), data);
  assert.equal(rows.find(x => x.classId === "10").winningsCents, 6000);
  assert.equal(rows.find(x => x.classId === "10").ropingsEntered, 0);
  assert.equal(rows.find(x => x.classId === "11").ropingsEntered, 1);
  assert.equal(rows.find(x => x.classId === "10").hasCarryover, true);
});

test("portal progress uses independent attendance and standings deadlines", () => {
  const member = context(); member.requirements = [{ classId: "11", topPlaces: 1, minimumRopings: 2, cutoffOn: "2026-06-30", attendanceCutoffOn: "2026-07-01" }];
  const data = source(); data.contributions = [contribution("own", "first", 100), contribution("own", "second", 0, { date: "2026-07-01" }), contribution("leader", "second", 10000, { date: "2026-07-01" })];
  const row = personalStandings(member, data)[0];
  assert.equal(row.rank, 2); assert.equal(row.qualifyingRank, 1); assert.equal(row.qualifyingCount, 2); assert.equal(row.meetsRequirements, true);
  const html = renderToStaticMarkup(React.createElement(PortalStandings, { context: member, rows: [row] }));
  assert.match(html, /Standings through 2026-06-30/); assert.match(html, /Attendance through 2026-07-01/);
});
test("a current class without official results is unranked, not automatically qualified", () => {
  const member = context(); member.requirements = [{ classId: "11", topPlaces: null, minimumRopings: 0, cutoffOn: null }];
  const row = personalStandings(member, source())[0];
  assert.equal(row.rank, null); assert.equal(row.ropingsEntered, 0); assert.equal(row.meetsRequirements, false);
});
test("handicap and 4-D remain separate grouped standings with the roper's handicap", () => {
  const data = source();
  data.classes.push({ id: "ba:handicap", name: "Handicap", divisionName: "Breakaway" }, { id: "ba:four_d", name: "4-D", divisionName: "Breakaway" });
  data.contributions = [contribution("own", "handicap", 5000, { classId: "ba:handicap" }), contribution("own", "four-d", 3000, { classId: "ba:four_d" })];
  data.ropers = [{ roperId: "own", classId: "ba:handicap", handicap: "C", handicapSeconds: -0.5 }];
  const rows = personalStandings(context(), data);
  assert.equal(rows.find(row => row.classId === "ba:handicap").handicap, "C");
  assert.equal(rows.find(row => row.classId === "ba:handicap").ropingsEntered, 1);
  assert.equal(rows.find(row => row.classId === "ba:four_d").ropingsEntered, 1);
});
test("standings UI shows progress and links to its class without promising entry eligibility", () => {
  const member = context(); member.requirements = [{ classId: "11", topPlaces: 10, minimumRopings: 10, cutoffOn: "2027-04-01" }];
  const data = source(); data.contributions = [contribution("own", "first", 12345)];
  const html = renderToStaticMarkup(React.createElement(PortalStandings, { context: member, rows: personalStandings(member, data) }));
  assert.match(html, /\$123\.45/); assert.match(html, /1 of 10 required ropings/); assert.match(html, /9 more needed/); assert.match(html, /class=11/); assert.doesNotMatch(html, /Eligible to enter/);
});
test("portal navigation uses a compact section selector on mobile", () => {
  const html = renderToStaticMarkup(React.createElement(PortalNavigation, { producerSlug: "producer", view: "standings", upcoming: 2, pending: 1 }));
  assert.match(html, /name="view"/); assert.match(html, /sm:hidden/); assert.match(html, /hidden flex-wrap/); assert.match(html, /aria-current="page"/);
});
