import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";

function harness(result = { success: true, message: "Template order saved." }, enabled = true) {
  const states = [], refs = [], saves = [], tasks = [];
  let stateIndex = 0, refIndex = 0;
  const source = transpileModule(readFileSync(new URL("../src/components/settings/template-order-list.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText;
  const jsx = (type, props) => ({ type, props });
  const imports = name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
      useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
      useTransition: () => [false, callback => tasks.push(callback())],
    };
    if (name === "lucide-react") return { ArrowDown: "down", ArrowUp: "up", GripVertical: "grip" };
    if (name.endsWith("/actions")) return { reorderRopingTemplates: async ids => { saves.push(ids); if (result instanceof Error) throw result; return result; } };
    throw new Error(name);
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  const items = ["a", "b", "c"].map(id => ({ id, name: id.toUpperCase(), content: id }));
  const component = compiled.exports.TemplateOrderList({ items, enabled });
  function render() { stateIndex = 0; refIndex = 0; return component.type(component.props); }
  function nodes(tree, predicate) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
  }
  return { render, saves, refs, done: () => Promise.all(tasks), states,
    button: (tree, label) => nodes(tree, node => node.props?.["aria-label"] === label)[0],
    buttons: tree => nodes(tree, node => node.type === "button"),
  };
}

test("moving a template saves the complete order", async () => {
  const h = harness();
  h.button(h.render(), "Move B up").props.onClick();
  await h.done();
  assert.deepEqual(h.saves, [["b", "a", "c"]]);
  assert.deepEqual(h.states[0], ["b", "a", "c"]);
});

for (const result of [{ message: "Manager access is required." }, new Error("offline")]) {
  test(`failed save restores the original order (${result.message})`, async () => {
    const h = harness(result);
    h.button(h.render(), "Move A down").props.onClick();
    await h.done();
    assert.deepEqual(h.states[0], ["a", "b", "c"]);
    assert.match(h.states[1], /Manager access|Unable to save/);
  });
}

test("read-only users have no reorder controls", () => {
  const h = harness(undefined, false);
  assert.equal(h.buttons(h.render()).length, 0);
});

test("pointer drag saves on release; cancellation saves nothing", async () => {
  const h = harness();
  let tree = h.render();
  h.refs[1].current = { querySelectorAll: () => ["a", "b", "c"].map((id, index) => ({ dataset: { templateOrderId: id }, getBoundingClientRect: () => ({ top: 100 + index * 100, bottom: 200 + index * 100 }) })) };
  globalThis.window = { innerHeight: 1000, scrollBy() {} };
  try {
    const handle = h.button(tree, "Drag to reorder A").props;
    const event = { button: 0, pointerId: 1, clientY: 150, currentTarget: { setPointerCapture() {} } };
    handle.onPointerDown(event);
    handle.onPointerMove({ ...event, clientY: 350 });
    handle.onPointerCancel();
    assert.equal(h.saves.length, 0);
    handle.onPointerDown(event);
    handle.onPointerMove({ ...event, clientY: 350 });
    handle.onPointerUp();
    await h.done();
    assert.deepEqual(h.saves, [["b", "c", "a"]]);
  } finally { delete globalThis.window; }
});
