import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
test("interaction motion is opt-in to normal motion preferences and stays short", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /animation: dialog-enter 180ms/);
  assert.match(css, /animation: content-enter 160ms/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /transition-duration: 0s !important/);
});
test("collapses retain conditional mounting instead of hiding active form fields", () => {
  const source = readFileSync(new URL("../src/components/ui/collapsible-card.tsx", import.meta.url), "utf8");
  assert.match(source, /open \? <div id=\{contentId\} className="disclosure-content"/);
  assert.match(source, /aria-expanded=\{open\}/);
});
