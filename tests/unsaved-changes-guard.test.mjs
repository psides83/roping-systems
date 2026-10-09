import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiled = { exports: {} };
let guarded;
const source = transpileModule(readFileSync(new URL("../src/components/ui/unsaved-changes-guard.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
new Function("require", "module", "exports", source)((name) => name === "nextjs-nav-guard" ? { useNavigationGuard: ({ enabled }) => { guarded = enabled; return { active: false, accept() {}, reject() {} }; } } : require(name), compiled, compiled.exports);
const { UnsavedChangesGuard } = compiled.exports;
test("only unsaved changes enable navigation protection", () => {
  for (const dirty of [false, true]) {
    renderToStaticMarkup(React.createElement(UnsavedChangesGuard, { dirty }));
    assert.equal(guarded, dirty);
  }
});
test("guard offers safe default, save-and-stay and explicit discard", () => {
  const html = renderToStaticMarkup(React.createElement(UnsavedChangesGuard, { dirty: true, onSave() {} }));
  assert.match(html, /<dialog/);
  assert.match(html, /aria-describedby="unsaved-changes-description"/);
  assert.match(html, /autofocus=""/);
  for (const label of ["Keep editing", "Save draft and stay", "Leave without saving"]) assert.ok(html.includes(label));
});
test("saving blocks discarding edits or launching another save", () => {
  const html = renderToStaticMarkup(React.createElement(UnsavedChangesGuard, { dirty: true, saving: true, onSave() {} }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /draft is being saved/);
});
