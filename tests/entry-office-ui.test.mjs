import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

// Render the actual controls with deterministic dialog state and inert server actions.
function loadComponent(path, mode = "member") {
  let stateIndex = 0;
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
  const imports = (name) => {
    if (name === "react") return {
      ...React,
      useState: (initial) => [stateIndex++ === 0 ? true : initial === "member" ? mode : initial, () => {}],
      useEffect: () => {},
      useActionState: () => [{}, () => {}, false],
    };
    if (name.endsWith("/entries/actions")) return new Proxy({}, { get: () => () => {} });
    if (name === "@/lib/utils") return { cn: (...values) => values.join(" "), formatCurrency: (cents) => `$${cents / 100}`, formatPhoneNumber: (value) => value };
    if (name.endsWith("/phone-input")) return { PhoneInput: () => React.createElement("input", { name: "phone" }) };
    return require(name);
  };
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  return compiled.exports;
}

const divisions = [{ id: "test", name: "Open", allowGuests: true, options: [] }];
for (const mode of ["member", "guest"]) {
  test(`Entry Office ${mode} dialog exposes neither exceptions nor payment shortcuts`, () => {
    const { EntryFormDialog } = loadComponent("../src/components/events/entry-form-dialog.tsx", mode);
    const html = renderToStaticMarkup(React.createElement(EntryFormDialog, { eventId: "event", divisions, ropers: [], manager: false }));
    assert.match(html, /Add in-person entry/);
    assert.doesNotMatch(html, /Approve an eligibility exception|Paid cash|Comped/);
    if (mode === "guest") assert.match(html, /First name/);
  });
}

test("Entry Office can review online requests without eligibility overrides", () => {
  const { OnlineEntryRequestList } = loadComponent("../src/components/events/online-entry-request-list.tsx");
  const html = renderToStaticMarkup(React.createElement(OnlineEntryRequestList, {
    eventId: "event", enabled: true, manager: false,
    requests: [{ id: "request", name: "Test Roper", email: "test@example.com", membershipVerified: true, items: [] }],
  }));
  assert.match(html, /Accept/);
  assert.match(html, /Decline/);
  assert.doesNotMatch(html, /Approve eligibility exception|disabled=""/);
});

test("Read-only online request controls are disabled", () => {
  const { OnlineEntryRequestList } = loadComponent("../src/components/events/online-entry-request-list.tsx");
  const html = renderToStaticMarkup(React.createElement(OnlineEntryRequestList, {
    eventId: "event", enabled: false, manager: false,
    requests: [{ id: "request", name: "Test Roper", email: "test@example.com", membershipVerified: true, items: [] }],
  }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});
