import assert from "node:assert/strict";
import test from "node:test";
import { formatEntryLabel } from "../src/lib/entry-labels.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("entry labels default to numbers without changing entry identities", () => {
  assert.equal(formatEntryLabel(1), "1");
  assert.equal(formatEntryLabel(3, "number"), "3");
  assert.equal(formatEntryLabel(27, "number"), "27");
});

test("letter labels follow A, B, C and continue beyond Z", () => {
  for (const [number, label] of [[1, "A"], [2, "B"], [3, "C"], [26, "Z"], [27, "AA"], [52, "AZ"], [53, "BA"], [703, "AAA"]]) {
    assert.equal(formatEntryLabel(number, "letter"), label);
  }
});

test("invalid entry numbers do not loop or receive misleading letter labels", () => {
  for (const number of [0, -1, 1.5, Infinity, NaN]) {
    assert.equal(formatEntryLabel(number, "letter"), String(number));
  }
});

test("shared entry display uses the selected producer preference without leaking between producers", () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../src/components/events/entry-label.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)((name) => name === "@/lib/entry-labels" ? { formatEntryLabel } : require(name), compiled, compiled.exports);
  const { EntryLabel, EntryLabelProvider } = compiled.exports;
  const render = (style) => renderToStaticMarkup(createElement(EntryLabelProvider, { style }, createElement(EntryLabel, { number: 2 })));
  assert.equal(render("letter"), "B");
  assert.equal(render("number"), "#2");
  assert.equal(renderToStaticMarkup(createElement(EntryLabel, { number: 1 })), "#1");
});
