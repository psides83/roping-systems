import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ruleTextStyle } from "../src/lib/rule-text-style.ts";
import { renderToStaticMarkup } from "react-dom/server";
import * as rules from "../src/lib/producer-rules.ts";

const require = createRequire(import.meta.url);
function load(path, overrides) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)((name) => overrides[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const { RuleText } = load("../src/components/rules/rule-text.tsx", { "react-markdown": { default: Markdown }, "remark-gfm": { default: remarkGfm }, "@/lib/rule-text-style": { ruleTextStyle } });
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
test("expanded formatting appears in the public renderer", () => {
  const html = renderToStaticMarkup(React.createElement(RuleText, { text: "## Eligibility\n\n~~Removed rule~~\n\n> Important note\n\n---\n\n`Code`\n\n```\nExample\n```" }));
  for (const tag of ["h2", "del", "blockquote", "hr", "code", "pre"]) assert.ok(html.includes(`<${tag}`));
});

test("bulletins reuse formatting with separate labels and unique section anchors", () => {
  const document = { ...rules.emptyRules, title: "Finals announcement", effectiveOn: "2026-10-08", sections: [{ id: "section-one", title: "Entries", content: "**Now open**", subsections: [] }] };
  const html = renderToStaticMarkup(React.createElement(RulesContent, { document, kind: "bulletin", anchorPrefix: "bulletin-one" }));
  assert.match(html, /Search bulletin/);
  assert.match(html, /Dated October 8, 2026/);
  assert.match(html, /href="#bulletin-one-section-one"/);
  assert.match(html, /id="bulletin-one-section-one"/);
  assert.match(html, /<strong>Now open<\/strong>/);
  assert.doesNotMatch(html, /<h1/);
});

test("news supports paging and opens a selected older bulletin on its page", () => {
  const { PublicBulletins } = load("../src/components/news/public-bulletins.tsx", { "@/components/rules/rules-content": { RulesContent } });
  const items = Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}`, publishedAt: "2026-10-08", document: { ...rules.emptyRules, title: `Announcement ${index}`, effectiveOn: "2026-10-08" } }));
  const html = renderToStaticMarkup(React.createElement(PublicBulletins, { items, selected: "item-22" }));
  assert.match(html, /Page 3 of 3/);
  assert.match(html, /id="bulletin-item-22" open=""/);
  assert.doesNotMatch(html, /Announcement 0</);
  assert.match(html, /Latest first/);
});
