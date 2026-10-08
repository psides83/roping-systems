import test from "node:test";
import assert from "node:assert/strict";
import { emptyRules, rulesDocumentSchema, rulesPublishErrors } from "../src/lib/producer-rules.ts";

const section = { id: "10000000-0000-4000-8000-000000000001", title: "Entries", content: "Members may enter.", subsections: [] };
test("incomplete rules can be saved but not published", () => {
  assert.ok(rulesDocumentSchema.safeParse(emptyRules).success);
  assert.ok(rulesPublishErrors(emptyRules).length);
  assert.deepEqual(rulesPublishErrors({ ...emptyRules, sections: [section] }), []);
  assert.ok(rulesPublishErrors({ ...emptyRules, sections: [{ ...section, content: "", subsections: [{ id: "10000000-0000-4000-8000-000000000002", title: "", content: "" }] }] }).length);
});
test("rules reject duplicate identifiers, invalid dates and unsafe document links", () => {
  assert.equal(rulesDocumentSchema.safeParse({ ...emptyRules, sections: [section, section] }).success, false);
  assert.equal(rulesDocumentSchema.safeParse({ ...emptyRules, effectiveOn: "2026-02-30" }).success, false);
  const attachment = { id: "10000000-0000-4000-8000-000000000003", name: "Rules PDF", url: "https://example.com/rules.pdf?download=1" };
  assert.ok(rulesDocumentSchema.safeParse({ ...emptyRules, attachments: [attachment] }).success);
  for (const url of ["", "not a url", "javascript:alert(1)", "http://example.com/rules.pdf", "https://example.com/rules.html", "https://user:password@example.com/rules.pdf"]) {
    assert.equal(rulesDocumentSchema.safeParse({ ...emptyRules, attachments: [{ ...attachment, url }] }).success, false);
  }
});
