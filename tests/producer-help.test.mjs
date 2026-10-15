import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { producerGuides, producerGlossary, helpCategories, findProducerGuide, filterProducerGuides } from "../src/lib/producer-help.ts";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
test("guides have unique routes, useful outcomes, and valid related destinations", () => {
  assert.equal(new Set(producerGuides.map(guide => guide.id)).size, producerGuides.length);
  for (const guide of producerGuides) {
    assert.match(guide.id, /^[a-z][a-z-]+$/);
    assert.ok(helpCategories.includes(guide.category));
    assert.ok(guide.steps.length >= 4);
    assert.ok(guide.before && guide.outcome && guide.troubleshooting);
    assert.match(guide.destination.href, /^\/(settings|events|reports)(\/|$)/);
    for (const id of guide.related) assert.ok(findProducerGuide(id), `${guide.id} has a missing related guide ${id}`);
  }
  assert.ok(producerGlossary.some(item => item.term === "Roping template"));
  assert.equal(findProducerGuide("unknown-guide"), undefined);
});
test("guide search matches producer vocabulary, normalizes whitespace, and combines category filters", () => {
  assert.ok(filterProducerGuides("  ENTER   twice  ").some(guide => guide.id === "templates"));
  assert.ok(filterProducerGuides("2 entries").some(guide => guide.id === "templates"));
  assert.ok(filterProducerGuides("timing control", "Event day").some(guide => guide.id === "live-desk"));
  assert.equal(filterProducerGuides("enter twice", "After the event").length, 0);
  assert.equal(filterProducerGuides("a guide that does not exist").length, 0);
  assert.equal(filterProducerGuides("  ").length, producerGuides.length);
});
test("guides preserve the distinction between auto saves, draw saves, and unconfirmed results", () => {
  assert.match(findProducerGuide("templates").outcome, /does not silently replace/);
  assert.match(findProducerGuide("live-desk").steps.join(" "), /Save order.*does not save automatically/);
  assert.match(findProducerGuide("live-desk").troubleshooting, /may still have reached the server.*Check saved status/);
  assert.match(findProducerGuide("payouts").steps.join(" "), /does not by itself mean money was paid/);
});
const link = { default: ({ children, ...props }) => React.createElement("a", props, children) };
test("help library renders task links and provides recovery when filters have no matches", () => {
  for (const query of ["", "no matching task"]) {
    let index = 0;
    const { HelpLibrary } = load("../src/components/help/help-library.tsx", {
      react: { ...React, useState: () => [index++ === 0 ? query : "all", () => {}] },
      "next/link": link,
      "@/lib/producer-help": { filterProducerGuides, helpCategories, producerGlossary },
    });
    const html = renderToStaticMarkup(React.createElement(HelpLibrary));
    assert.match(html, /role="status"/);
    if (query) { assert.match(html, /No guides match.*Show all guides/); assert.doesNotMatch(html, /href="\/help\/templates"/); }
    else { assert.match(html, /href="\/help\/templates"/); assert.match(html, /A few useful terms/); }
  }
});
test("contextual guide links keep the current working screen open and announce the new tab", () => {
  const { HelpLink } = load("../src/components/help/help-link.tsx", { "next/link": link });
  const html = renderToStaticMarkup(React.createElement(HelpLink, { guide: "entries", label: "Entry guide" }));
  assert.match(html, /href="\/help\/entries"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /opens in a new tab/);
});
test("unknown guide routes render not-found rather than silently showing an unrelated guide", async () => {
  const { default: GuidePage } = load("../src/app/(app)/help/[guide]/page.tsx", {
    "next/link": link,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/components/ui/page-header": { PageHeader: () => null },
    "@/lib/producer-help": { findProducerGuide },
  });
  await assert.rejects(() => GuidePage({ params: Promise.resolve({ guide: "unknown-guide" }) }), /NOT_FOUND/);
});
