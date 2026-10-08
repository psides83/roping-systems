import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const compiled = { exports: {} };
const code = transpileModule(readFileSync(new URL("../src/components/ui/number-stepper.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
}).outputText;
new Function("require", "module", "exports", code)((name) => name === "@/lib/utils" ? { cn: (...classes) => classes.filter(Boolean).join(" ") } : require(name), compiled, compiled.exports);
const render = (props) => renderToStaticMarkup(React.createElement(compiled.exports.NumberStepper, { label: "Main rounds", name: "rounds", min: 1, max: 20, ...props }));

test("Count steppers have labeled non-submit buttons and retain native numeric validation", () => {
  const html = render({ defaultValue: 3, required: true });
  assert.match(html, /aria-label="Decrease main rounds"/);
  assert.match(html, /aria-label="Increase main rounds"/);
  assert.equal((html.match(/type="button"/g) ?? []).length, 2);
  assert.match(html, /name="rounds"/);
  assert.match(html, /type="number"/);
  assert.match(html, /required=""/);
  assert.match(html, /value="3"/);
});
test("Bounds, disabled fields, and read-only counts disable the appropriate buttons", () => {
  const disabledButtons = (props) => (render(props).match(/<button[^>]*disabled=""/g) ?? []).length;
  assert.equal(disabledButtons({ defaultValue: 1 }), 1);
  assert.equal(disabledButtons({ defaultValue: 20 }), 1);
  assert.equal(disabledButtons({ defaultValue: 3 }), 0);
  assert.equal(disabledButtons({ defaultValue: "" }), 0);
  assert.equal(disabledButtons({ value: 0, min: 0 }), 1);
  assert.equal(disabledButtons({ disabled: true }), 2);
  assert.equal(disabledButtons({ readOnly: true }), 2);
});
test("Browser spinners are removed globally, especially from timer input and correction fields", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /input\[type="number"\]::-webkit-inner-spin-button/);
  assert.match(css, /-webkit-appearance: none/);
  assert.match(css, /-moz-appearance: textfield/);
  for (const name of ["live-run-entry-form", "run-correction-dialog"]) {
    const source = readFileSync(new URL(`../src/components/events/${name}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /NumberStepper/);
    assert.match(source, /inputMode="decimal"/);
  }
});
