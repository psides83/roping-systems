import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test("producer menu opens for mouse hover, retains touch click, and closes outside or on Escape", () => {
  const updates = [], effects = [], listeners = new Map();
  let stateIndex = 0;
  const inside = {};
  const loaded = { exports: {} };
  new Function("require", "exports", source)(id => {
    if (id === "react") return { useState: () => [stateIndex++ === 1, value => updates.push(value)], useRef: initial => ({ current: initial === false ? false : { contains: target => target === inside } }), useEffect: effect => effects.push(effect) };
    if (id === "next/navigation") return { usePathname: () => "/dashboard" };
    if (id === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") };
    if (id === "@/lib/branding") return { getBrandStyle: () => ({}) };
    if (id.includes("producer-features-context")) return { useProducerFeatures: () => ({}) };
    if (id.includes("producer-features")) return { featureEnabled: () => true };
    if (id.startsWith("@/")) return new Proxy({}, { get: () => () => null });
    return (id === "@/components/ui/persistent-form" ? { PersistentForm: "form" } : require(id));
  }, loaded.exports);
  const tree = loaded.exports.AppShell({ children: null, platformOwner: true });
  function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
  }
  const wrapper = find(tree, node => node.props?.onPointerEnter);
  wrapper.props.onPointerEnter({ pointerType: "touch" }); assert.equal(updates.length, 0);
  wrapper.props.onPointerEnter({ pointerType: "mouse" }); assert.equal(updates.pop(), true);
  const trigger = find(tree, node => node.props?.["aria-controls"] === "producer-account-menu");
  assert.equal(trigger.props["aria-expanded"], true);
  wrapper.props.onPointerLeave({ pointerType: "mouse" }); assert.equal(updates.pop(), false);
  trigger.props.onClick(); assert.equal(updates.pop(), true);
  wrapper.props.onPointerLeave({ pointerType: "mouse" }); assert.equal(updates.length, 0);
  const previousDocument = globalThis.document, previousNode = globalThis.Node;
  globalThis.Node = Object;
  globalThis.document = { addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
  try {
    const cleanup = effects[0]();
    listeners.get("pointerdown")({ target: inside }); assert.equal(updates.length, 0);
    listeners.get("pointerdown")({ target: {} }); assert.equal(updates.pop(), false);
    wrapper.props.onPointerLeave({ pointerType: "mouse" }); assert.equal(updates.pop(), false);
    listeners.get("keydown")({ key: "Escape" }); assert.equal(updates.pop(), false);
    cleanup(); assert.equal(listeners.size, 0);
  } finally { globalThis.document = previousDocument; globalThis.Node = previousNode; }
});
