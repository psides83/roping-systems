import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import Markdown from "react-markdown";
import { renderToStaticMarkup } from "react-dom/server";
import * as rules from "../src/lib/producer-rules.ts";

const require = createRequire(import.meta.url);
function load(path, overrides) {
  const module = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)((name) => overrides[name] ?? require(name), module, module.exports);
  return module.exports;
}
const { RuleText } = load("../src/components/rules/rule-text.tsx", { "react-markdown": { default: Markdown } });
const { RulesContent } = load("../src/components/rules/rules-content.tsx", { "@/lib/producer-rules": rules, "./rule-text": { RuleText } });
test("rule formatting renders basic lists and bold without executable HTML or unsafe links", () => {
  const html = renderToStaticMarkup(React.createElement(RuleText, { text: "**Bold**\n\n1. First\n2. Second\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert%281%29)\n\n[Safe](https://example.com)" }));
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<ol>/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/);
});
test("rules show headings, date, section navigation and safe PDF documents", () => {
  const document = { ...rules.emptyRules, effectiveOn: "2026-10-08", sections: [{ id: "10000000-0000-4000-8000-000000000001", title: "Membership", content: "Members must be eligible.", subsections: [{ id: "10000000-0000-4000-8000-000000000002", title: "Breakaway", content: "Review classification requirements." }] }], attachments: [{ id: "10000000-0000-4000-8000-000000000003", name: "Unsafe preview", url: "javascript:alert(1)" }] };
  const html = renderToStaticMarkup(React.createElement(RulesContent, { document }));
  assert.match(html, /Effective October 8, 2026/);
  assert.match(html, /aria-label="Rules sections"/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /Search rules/);
});
