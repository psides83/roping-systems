import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("cutoff tooltip explains inclusion and is available on hover and keyboard focus", () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL("../src/components/settings/cutoff-date-label.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
  const html = renderToStaticMarkup(createElement(compiled.exports.CutoffDateLabel));
  assert.match(html, /cutoff date is inclusive/);
  assert.match(html, /official winnings dated on this day count/);
  assert.match(html, /following day do not count/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /tabindex="0"/);
  const id = html.match(/aria-describedby="([^"]+)"/)[1];
  assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /group-hover:block/);
  assert.match(html, /group-focus-within:block/);
});
