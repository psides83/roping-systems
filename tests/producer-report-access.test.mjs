import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(fs.readFileSync(new URL("../src/lib/producer-report-options.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function("require", "exports", source)(() => ({}), exports);
const { canExportReport, validateReportSelection } = exports;
const options = { producer: { role: "viewer" }, seasons: [{ id: "s" }], classifications: [{ id: "c" }], events: [{ id: "e" }], funds: [{ id: "f" }] };
test("restricted staff cannot export finances; treasurers and managers can", () => {
  assert.equal(canExportReport("viewer", false, "funds"), false);
  assert.equal(canExportReport("unknown", false, "funds"), false);
  assert.equal(canExportReport("viewer", false, "payouts"), false);
  assert.equal(canExportReport("viewer", true, "collections"), true);
  assert.equal(canExportReport("owner", false, "funds"), true);
  assert.equal(canExportReport("viewer", false, "standings"), true);
  assert.throws(() => validateReportSelection(options, { report: "funds" }));
});
test("every supplied record filter must belong to the verified producer", () => {
  for (const key of ["season", "classification", "event", "fund"]) assert.throws(() => validateReportSelection(options, { report: "attendance", season: "s", [key]: "foreign" }));
  assert.throws(() => validateReportSelection(options, { report: "attendance" }));
  assert.throws(() => validateReportSelection(options, { report: "attendance", season: "s", producer: "another-producer" }));
  assert.doesNotThrow(() => validateReportSelection(options, { report: "attendance", season: "s", classification: "c", event: "e" }));
});
