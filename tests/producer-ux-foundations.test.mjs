import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
for (const mode of ["clean", "dirty-discard", "dirty-stay", "busy"]) {
  test(`dialog dismissal protects edits and pending saves: ${mode}`, () => {
    let closed = 0, prompts = 0, prevented = 0;
    const { Dialog } = load("../src/components/ui/dialog.tsx", {
      react: { useRef: value => ({ current: value }), useId: () => "dialog-id", useEffect() {} },
    });
    const previous = globalThis.window;
    globalThis.window = { confirm: () => { prompts++; return mode !== "dirty-stay"; } };
    try {
      const tree = Dialog({ title: "Edit template", description: "Edit settings", onClose: () => closed++, busy: mode === "busy", children: null });
      if (mode.startsWith("dirty")) tree.props.onChangeCapture();
      tree.props.onCancel({ preventDefault: () => prevented++ });
      assert.equal(prevented, 1);
      assert.equal(closed, mode === "clean" || mode === "dirty-discard" ? 1 : 0);
      assert.equal(prompts, mode.startsWith("dirty") ? 1 : 0);
      assert.equal(tree.props["aria-busy"], mode === "busy");
    } finally { globalThis.window = previous; }
  });
}
test("mobile section navigation displays the active section and follows selected destinations", () => {
  const navigated = [];
  const { SectionNavigation } = load("../src/components/ui/section-navigation.tsx", {
    react: { useEffect() {}, useRef: value => ({ current: value }), useId: () => "section-id" },
    "next/navigation": { useRouter: () => ({ push: href => navigated.push(href) }) },
    "nextjs-nav-guard": { NavigationGuardLink: "a" },
  });
  const tree = SectionNavigation({ label: "Roping setup", active: "templates", items: [{ id: "setup", label: "Setup checklist", href: "/settings/setup" }, { id: "templates", label: "Roping templates", href: "/settings/roping-templates" }] });
  const select = nodes(tree, node => node.type === "select")[0];
  assert.equal(select.props.value, "templates");
  select.props.onChange({ target: { value: "setup" } });
  assert.deepEqual(navigated, ["/settings/setup"]);
  assert.equal(nodes(tree, node => node.props?.["aria-current"] === "page").length, 1);
});

test("dialog protects schedule changes stored in hidden fields without a change event", () => {
  const form = {};
  let schedule = "original", closed = 0, prompts = 0;
  const { Dialog } = load("../src/components/ui/dialog.tsx", {
    react: { useEffect() {}, useId: () => "dialog", useRef: value => ({ current: value instanceof Map ? new Map([[form, JSON.stringify([["classOccurrences", "original"]])]]) : value }) },
  });
  const previousWindow = globalThis.window, previousFormData = globalThis.FormData;
  globalThis.window = { confirm: () => { prompts++; return false; } };
  globalThis.FormData = class { *[Symbol.iterator]() { yield ["classOccurrences", schedule]; } };
  try {
    const tree = Dialog({ title: "Create event", description: "Schedule", onClose: () => closed++, children: null });
    schedule = "reordered";
    tree.props.onCancel({ preventDefault() {} });
    assert.equal(prompts, 1);
    assert.equal(closed, 0);
  } finally { globalThis.window = previousWindow; globalThis.FormData = previousFormData; }
});
