import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { payoutScheduleCsv, parsePayoutSpreadsheet, samplePayoutSchedule } from "../src/lib/payout-spreadsheet.ts";
const roundtrip = schedule => parsePayoutSpreadsheet(Papa.parse(payoutScheduleCsv(schedule)).data);
test("standard schedule CSV roundtrips without IDs or loss of percentages", () => {
  const schedule = { ...samplePayoutSchedule, id: "existing-id", name: 'Test, "Schedule"', description: "Two\nlines" };
  assert.deepEqual(roundtrip(schedule), { ...schedule, id: "" });
});
test("4D and short-round settings roundtrip", () => {
  const schedule = { ...samplePayoutSchedule, competitionFormat: "four_d", shortRoundEnabled: true,
    goRoundsPercent: 40, aggregatePercent: 40, shortRoundPercent: 20,
    bracketsByStage: { ...samplePayoutSchedule.bracketsByStage, short_round: [{ minimumEntries: 1, maximumEntries: null, percentages: [100] }] },
    fourDSettings: { splitSeconds: 0.5, brackets: [{ minimumEntries: 1, maximumEntries: null, activeDivisions: 4, purseBasisPoints: [3300, 2800, 2200, 1700], placesByDivision: [2, 2, 2, 2] }] },
  };
  assert.deepEqual(roundtrip(schedule), schedule);
});
test("drafts with empty paid-place ranges and settings-only drafts survive export", () => {
  const schedule = { ...samplePayoutSchedule, bracketsByStage: { go_round: [{ minimumEntries: 1, maximumEntries: null, percentages: [] }], aggregate: [], short_round: [] } };
  assert.deepEqual(roundtrip(schedule), schedule);
  const empty = { ...schedule, bracketsByStage: { go_round: [], aggregate: [], short_round: [] } };
  assert.deepEqual(roundtrip(empty), empty);
});
test("formula-like names are escaped in CSV and preserved when reimported", () => {
  for (const name of ["=HYPERLINK(1)", "+Schedule", "@Schedule", "-Schedule"]) {
    const schedule = { ...samplePayoutSchedule, name };
    assert.equal(Papa.parse(payoutScheduleCsv(schedule)).data[1][0], `'${name}`);
    assert.equal(roundtrip(schedule).name, name);
  }
});
test("malformed, conflicting and duplicate spreadsheet values are rejected before review", () => {
  const original = Papa.parse(payoutScheduleCsv(samplePayoutSchedule)).data;
  const change = (column, value, row = 1) => { const data = structuredClone(original); data[row][data[0].indexOf(column)] = value; return data; };
  assert.throws(() => parsePayoutSpreadsheet(change("Place %", "not a percent")), /Row 2.*Place %/);
  assert.throws(() => parsePayoutSpreadsheet(change("Place %", "50.123")), /two decimals/);
  assert.throws(() => parsePayoutSpreadsheet(change("Place", "101")), /whole number/);
  assert.throws(() => parsePayoutSpreadsheet(change("Place", "3")), /consecutive/);
  assert.throws(() => parsePayoutSpreadsheet(change("Schedule", "Different", 2)), /consistent/);
  assert.throws(() => parsePayoutSpreadsheet([...original, original[1]]), /duplicated/);
  assert.throws(() => parsePayoutSpreadsheet(change("Stage", "Short round")), /Enable short rounds/);
  assert.throws(() => parsePayoutSpreadsheet([original[0].map(x => x === "Place" ? "Place %" : x), ...original.slice(1)]), /duplicate column/);
});
test("familiar stage labels, percent suffixes and blank repeated settings are accepted", () => {
  const data = Papa.parse(payoutScheduleCsv(samplePayoutSchedule)).data;
  data[1][10] = "Go rounds"; data[1][14] = "60%";
  for (const row of data.slice(2)) row[0] = "";
  assert.deepEqual(parsePayoutSpreadsheet(data), samplePayoutSchedule);
});
