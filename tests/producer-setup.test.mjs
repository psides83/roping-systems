import test from "node:test";
import assert from "node:assert/strict";
import { producerSetupChecklist, setupChecklistSummary } from "../src/lib/producer-setup.ts";

const empty = () => ({ today: "2026-10-09", divisions: [], classifications: [], templates: [], schedules: [], seasons: [], dues: null, funds: [], qualifications: [] });
const complete = () => ({ ...empty(),
  divisions: [{ id: "td", name: "Tie-down", active: true }],
  classifications: [{ id: "11.5", divisionId: "td", active: true, standalone: true, adjustment: null }],
  templates: [{ id: "template", name: "Three head", divisionId: "td", active: true, format: "standard", scheduleId: "payout", shortRound: false, handicapIds: [], fees: [{ title: "Main purse", kind: "standard", contributes: true, scheduleId: null, fundId: null }] }],
  schedules: [{ id: "payout", name: "Standard payout", active: true, format: "standard", shortRound: false, issues: [] }],
  seasons: [{ id: "season", name: "2026–27", first: "2026-05-01", last: "2027-04-30" }],
});
const item = (data, id) => producerSetupChecklist(data).find((item) => item.id === id);

test("new producers have clear first steps and optional unused features", () => {
  const items = producerSetupChecklist(empty());
  assert.equal(setupChecklistSummary(items).next.id, "divisions");
  assert.equal(item(empty(), "dues").status, "optional");
  assert.equal(item(empty(), "qualifications").status, "optional");
  assert.equal(item(empty(), "payouts").status, "optional");
});
test("complete setup does not require dues or qualification rules", () => {
  const summary = setupChecklistSummary(producerSetupChecklist(complete()));
  assert.equal(summary.attention, 0);
  assert.equal(summary.ready, summary.total);
  assert.equal(summary.optional, 2);
});
test("active divisions need classifications and reusable templates, not a template per class", () => {
  const data = complete();
  data.classifications.push({ ...data.classifications[0], id: "10" });
  assert.equal(item(data, "templates").status, "ready");
  data.divisions.push({ id: "ba", name: "Breakaway", active: true });
  assert.equal(item(data, "classifications").status, "attention");
  assert.ok(item(data, "templates").issues[0].message.includes("Breakaway"));
});
test("4D-only divisions do not require standalone member classifications", () => {
  const data = complete();
  data.classifications = [];
  data.templates[0].format = "four_d";
  data.schedules[0].format = "four_d";
  assert.equal(item(data, "classifications").status, "optional");
  assert.equal(item(data, "templates").status, "ready");
});
test("shared templates satisfy setup for all selected divisions without duplicate templates", () => {
  const data = complete();
  data.divisions.push({ id: "ba", name: "Breakaway", active: true });
  data.classifications.push({ id: "open-ba", divisionId: "ba", active: true, standalone: true, adjustment: null });
  data.templates[0].availableDivisionIds = ["td", "ba"];
  assert.equal(item(data, "templates").status, "ready");
  assert.equal(item(data, "classifications").status, "ready");
  assert.match(item(data, "templates").detail, /1 active template/);
  data.templates[0].format = "handicap";
  data.templates[0].handicapIds = ["11.5", "open-ba"];
  data.classifications.forEach((classification) => { classification.adjustment = -0.25; });
  assert.equal(item(data, "templates").status, "ready");
});
test("Handicap classifications accept zero and signed offsets without standalone use", () => {
  const data = complete();
  data.templates[0].format = "handicap";
  data.templates[0].handicapIds = ["11.5"];
  data.classifications[0].standalone = false;
  for (const adjustment of [0, -0.5, 0.25]) {
    data.classifications[0].adjustment = adjustment;
    assert.equal(item(data, "templates").status, "ready");
  }
  data.classifications[0].active = false;
  assert.equal(item(data, "templates").status, "attention");
});
test("inactive divisions and templates do not satisfy active setup", () => {
  const data = complete(); data.templates[0].active = false;
  assert.equal(item(data, "templates").status, "attention");
  data.templates[0].active = true; data.divisions[0].active = false;
  assert.equal(item(data, "divisions").status, "attention");
  assert.equal(item(data, "templates").status, "attention");
});
test("unused payout drafts do not undo usable schedules", () => {
  const data = complete(); data.schedules.push({ ...data.schedules[0], id: "draft", issues: ["Incomplete places"] });
  assert.equal(item(data, "payouts").status, "ready");
  assert.match(item(data, "payouts").detail, /1 unused incomplete draft/);
  data.templates[0].scheduleId = "draft";
  assert.equal(item(data, "payouts").status, "attention");
  assert.equal(item(data, "payouts").issues[0].href, "/settings/payouts");
});
test("purse-bearing fees require schedules, including separate side and insurance pots", () => {
  const data = complete(); data.templates[0].scheduleId = null;
  assert.equal(item(data, "payouts").status, "attention");
  data.templates[0].fees = [];
  assert.equal(item(data, "payouts").status, "ready");
  data.templates[0].fees.push({ title: "Insurance", kind: "insurance", contributes: true, scheduleId: null, fundId: null });
  assert.match(item(data, "payouts").issues[0].message, /Insurance/);
});
test("format and short-round mismatches link to the template", () => {
  const data = complete(); data.schedules[0].format = "four_d";
  assert.equal(item(data, "payouts").status, "attention");
  data.schedules[0].format = "standard"; data.schedules[0].shortRound = true;
  assert.match(item(data, "payouts").issues[0].message, /no short round/);
});
test("next season is ready between seasons; past-only seasons need attention", () => {
  const data = complete(); data.today = "2026-04-01";
  assert.equal(item(data, "seasons").status, "ready");
  assert.match(item(data, "seasons").detail, /Next season/);
  data.today = "2027-05-01";
  assert.equal(item(data, "seasons").status, "attention");
});
test("dues allocations require an active fund, but no-contribution dues do not", () => {
  const data = complete(); data.dues = { amount: 10000, allocation: 2500, installments: true, fundId: "general" };
  assert.equal(item(data, "dues").status, "attention");
  data.funds.push({ id: "general", name: "General", active: true });
  assert.equal(item(data, "dues").status, "ready");
  data.dues.allocation = 0; data.funds[0].active = false;
  assert.equal(item(data, "dues").status, "ready");
  data.seasons = [];
  assert.equal(item(data, "dues").status, "attention");
});
test("automatic fund routing needs no manually created fund; explicit routing does", () => {
  const data = complete(); data.templates[0].fees.push({ title: "Finals contribution", kind: "added_money", contributes: false, scheduleId: null, fundId: null });
  assert.equal(item(data, "templates").status, "ready");
  data.templates[0].fees[1].fundId = "missing";
  assert.equal(item(data, "templates").issues[0].href, "/funds");
});
test("standings and attendance cutoffs are checked independently and include season end", () => {
  const data = complete(); data.qualifications.push({ id: "q", name: "Finals", seasonId: "season", standingsCutoff: "2027-04-30", attendanceCutoff: "2027-04-01" });
  assert.equal(item(data, "qualifications").status, "ready");
  data.qualifications[0].attendanceCutoff = "2027-05-01";
  assert.match(item(data, "qualifications").issues[0].message, /attendance cutoff/);
});
