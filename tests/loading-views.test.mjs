import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/ui/page-skeleton.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const compiled = { exports: {} };
new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
const { PageSkeleton, PublicPageSkeleton, AppBootSkeleton } = compiled.exports;

test("every page loading variant has a single accessible status and stable markup", () => {
  for (const variant of ["list", "dashboard", "event", "live", "payouts", "settings"]) {
    const markup = renderToStaticMarkup(createElement(PageSkeleton, { variant }));
    assert.equal((markup.match(/role="status"/g) ?? []).length, 1);
    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.equal(markup, renderToStaticMarkup(createElement(PageSkeleton, { variant })));
    assert.doesNotMatch(markup, /<button|<input|<select/);
  }
});
test("public and initial app loading views render without private producer data", () => {
  assert.match(renderToStaticMarkup(createElement(PublicPageSkeleton)), /Loading results/);
  assert.match(renderToStaticMarkup(createElement(AppBootSkeleton)), /Loading page/);
});
