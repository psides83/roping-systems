import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit, ScriptTarget } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path, open = false) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, target: ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", source)((name) => name === "react" ? {
    ...React, useState: () => [open, () => {}], useEffect: () => {}, useId: () => "actions", useRef: () => ({ current: null }),
  } : require(name), compiled, compiled.exports);
  return compiled.exports;
}

test("mobile secondary actions start collapsed with an accessible disclosure", () => {
  const { MobileActionMenu } = load("../src/components/ui/mobile-action-menu.tsx");
  const html = renderToStaticMarkup(React.createElement(MobileActionMenu, null, React.createElement("a", { href: "/entries" }, "Entries")));
  assert.match(html, /aria-label="More event actions"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="actions"/);
  assert.match(html, /hidden absolute/);
  assert.match(html, /sm:static sm:flex/);
  assert.match(html, /h-11 w-11/);
});

test("opened menu preserves navigation and uses a mobile vertical layout", () => {
  const { MobileActionMenu } = load("../src/components/ui/mobile-action-menu.tsx", true);
  const html = renderToStaticMarkup(React.createElement(MobileActionMenu, null, React.createElement("a", { href: "/public", target: "_blank", rel: "noopener noreferrer" }, "Public page")));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /flex absolute/);
  assert.match(html, /flex-col/);
  assert.match(html, /target="_blank"/);
});

test("shared page headers wrap actions instead of squeezing button labels", () => {
  const { PageHeader } = load("../src/components/ui/page-header.tsx");
  const html = renderToStaticMarkup(React.createElement(PageHeader, { title: "Test", description: "Event", actions: React.createElement("button", null, "Open event desk") }));
  assert.match(html, /max-w-full flex-wrap/);
  assert.match(html, /whitespace-nowrap/);
});
