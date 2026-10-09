import test from "node:test";
import assert from "node:assert/strict";
import { reportCsv, reportCsvChunks, parseReportFilters, reportInPeriod, reportDate, searchReport, formatReportCell } from "../src/lib/producer-reports.ts";
test("CSV escapes quotes, commas, newlines and spreadsheet formulas", () => {
  const csv = reportCsv({ title: "Test", columns: ["Name", "Deposit", "Comment"], rows: [['Smith, "Jane"', 125, '=HYPERLINK("https://example.com")'], ["\t@SUM(1)", -25, "Line 1\nLine 2"]] });
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"Smith, ""Jane""",125.00,"\'=HYPERLINK'));
  assert.ok(csv.includes('"\'\t@SUM(1)",-25.00,"Line 1\nLine 2"'));
  assert.ok(csv.endsWith("\r\n"));
  assert.throws(() => reportCsv({ title: "Test", columns: ["Value"], rows: [[NaN]] }));
});
test("report filters reject unknown reports and invalid dates", () => {
  for (const query of ["report=constructor", "report=payouts&from=2026-02-30", "report=funds&from=2026-10-10&through=2026-10-01", "report=standings&from=2026-05-01", "report=payouts&status=anything"])
    assert.throws(() => parseReportFilters(new URLSearchParams(query)));
});
test("date filters are inclusive in the producer's time zone", () => {
  const filters = parseReportFilters(new URLSearchParams("report=funds&from=2026-10-01&through=2026-10-09"));
  assert.ok(reportInPeriod("2026-10-01", filters));
  assert.ok(reportInPeriod("2026-10-09", filters));
  assert.equal(reportInPeriod("2026-10-10", filters), false);
  assert.equal(reportDate("2026-10-10T01:00:00Z", "America/Chicago"), "2026-10-09");
});
test("search filters complete rows without mutating the report", () => {
  const report = { title: "Attendance", columns: ["Name"], rows: [["Jane Smith"], ["John King"]] };
  assert.equal(searchReport(report, "SMITH").rows.length, 1);
  assert.equal(report.rows.length, 2);
  assert.equal(formatReportCell("Paid", 25.5), "$25.50");
  assert.equal(formatReportCell("Roping count", 25), "25");
});
test("chunked exports include every row, not just the screen preview", () => {
  const report = { title: "Fund ledger", columns: ["ID"], rows: Array.from({ length: 1250 }, (_, index) => [index]) };
  const chunks = [...reportCsvChunks(report)];
  assert.equal(chunks.length, 6);
  assert.equal(chunks.join(""), reportCsv(report));
  assert.ok(chunks.at(-1).endsWith("1249\r\n"));
});
