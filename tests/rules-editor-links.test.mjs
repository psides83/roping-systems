import test from "node:test";
import assert from "node:assert/strict";
import { isRuleLink } from "../src/lib/rules-editor-extensions.ts";
test("visual editor accepts web and email links but rejects executable and incomplete links", () => {
  for (const href of ["https://example.com/rules", "http://example.com", "mailto:office@example.com"]) assert.equal(isRuleLink(href), true);
  for (const href of ["", "https://", "javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "example.com"]) assert.equal(isRuleLink(href), false);
});
