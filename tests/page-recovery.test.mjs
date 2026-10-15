import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const link = { default: ({ children, ...props }) => React.createElement("a", props, children) };
test("recovery focuses its heading and prevents repeated retries while pending", async () => {
  for (const pending of [false, true]) {
    let retried = 0, focused = 0; const effects = [], tasks = [];
    const { PageRecovery } = load("../src/components/ui/page-recovery.tsx", {
      react: { useTransition: () => [pending, task => tasks.push(task())], useRef: () => ({ current: { focus: () => focused++ } }), useEffect: effect => effects.push(effect) },
      "next/link": link,
      "@/components/help/help-link": { HelpLink: () => null },
    });
    const tree = PageRecovery({ title: "Could not load", description: "Try again", retry: () => retried++ });
    effects[0](); assert.equal(focused, 1);
    const button = nodes(tree, node => node.type === "button")[0];
    assert.equal(button.props.disabled, pending);
    button.props.onClick(); await Promise.all(tasks);
    assert.equal(retried, pending ? 0 : 1);
    const heading = nodes(tree, node => node.type === "h1")[0];
    assert.equal(heading.props.tabIndex, -1);
    assert.equal(tree.props["aria-labelledby"], heading.props.id);
  }
});
test("recovery offers a safe exit and explains uncertain saves without leaking internals", () => {
  const { PageRecovery } = load("../src/components/ui/page-recovery.tsx", {
    react: { useTransition: () => [false, () => {}], useRef: () => ({ current: null }), useEffect() {} },
    "next/link": link,
    "@/components/help/help-link": { HelpLink: () => null },
  });
  const html = renderToStaticMarkup(PageRecovery({ title: "Could not load", description: "Check your connection", retry() {}, returnHref: "/events", returnLabel: "Return to events", error: new Error("private database details") }));
  assert.match(html, /href="\/events"/);
  assert.match(html, /does not confirm whether a save completed/);
  assert.match(html, /check its saved status/);
  assert.doesNotMatch(html, /private database details|No settings have been changed|No timing records were changed/);
});
test("producer, event, settings, setup, and arena boundaries use the shared recovery", () => {
  const cases = [["../src/app/(app)/error.tsx", "/dashboard"], ["../src/app/(app)/events/[eventId]/error.tsx", "/events"], ["../src/app/(app)/settings/error.tsx", "/dashboard"], ["../src/app/(app)/settings/setup/error.tsx", "/settings/roping-templates"], ["../src/app/(app)/events/[eventId]/arenas/error.tsx", "/events"]];
  for (const [path, href] of cases) {
    const { default: Boundary } = load(path, { "@/components/ui/page-recovery": { PageRecovery: "recovery" } });
    const retry = () => {};
    const tree = Boundary({ retry, error: new Error("Internal detail") });
    assert.equal(tree.type, "recovery");
    assert.equal(tree.props.retry, retry);
    assert.equal(tree.props.returnHref, href);
    assert.ok(tree.props.title && tree.props.description);
    assert.doesNotMatch(JSON.stringify(tree.props), /Internal detail/);
  }
});
test("unavailable records offer navigation without claiming a record exists", () => {
  const { UnavailableRecord } = load("../src/components/ui/unavailable-record.tsx", { "next/link": link });
  const html = renderToStaticMarkup(React.createElement(UnavailableRecord));
  assert.match(html, /may belong to another producer/);
  assert.match(html, /href="\/dashboard"/);
  const { default: MissingEvent } = load("../src/app/(app)/events/[eventId]/not-found.tsx", { "@/components/ui/unavailable-record": { UnavailableRecord: "unavailable" } });
  const event = MissingEvent();
  assert.equal(event.props.href, "/events");
  assert.match(event.props.description, /staff access may not include it/);
});
