import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path, name) {
  const loaded = { exports: {} };
  const compiled = transpileModule(readFileSync(new URL(`../src/components/${path}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return { ...React, useActionState: () => [{}, undefined, false] };
    if (id.endsWith("/actions")) return {};
    return require(id);
  }, loaded, loaded.exports);
  return loaded.exports[name];
}
const Request = load("roper/connection-request", "ConnectionRequest");
const Review = load("members/review-connection", "ReviewConnection");
test("connection requests require identifiers without claiming instant access", () => {
  const html = renderToStaticMarkup(React.createElement(Request));
  for (const label of ["Producer URL slug", "Member number", "Name on membership", "Request connection"]) assert.ok(html.includes(label));
  assert.equal((html.match(/required=""/g) ?? []).length, 3);
  assert.doesNotMatch(html, /(?:\s|")w-full(?:\s|")/);
});
test("staff review defaults to decline and requires a verification reason", () => {
  const html = renderToStaticMarkup(React.createElement(Review, { id: "request", status: "pending", members: [{ id: "member", label: "#123 · Cole Smith" }] }));
  assert.match(html, /value="declined"/);
  assert.match(html, /Choose a verified member/);
  assert.match(html, /Verification or decision reason/);
  assert.match(html, /minLength="5"/);
});
test("approved requests offer revocation rather than another approval", () => {
  const html = renderToStaticMarkup(React.createElement(Review, { id: "request", status: "approved", members: [] }));
  assert.match(html, /Revoke connection/);
  assert.match(html, /value="revoked"/);
  assert.doesNotMatch(html, /Choose a verified member/);
});
