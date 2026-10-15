import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { moveTemplate, replaceTemplateGroupOrder } from "../src/lib/template-order.ts";
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
    if (name === "@/lib/template-order") return { moveTemplate, replaceTemplateGroupOrder };
    if (name === "lucide-react") return { ArrowDown: "down", ArrowUp: "up", GripVertical: "grip" };
    if (name.endsWith("/actions")) return { reorderRopingTemplates: async ids => { saves.push(ids); if (result instanceof Error) throw result; return result; } };
    throw new Error(name);
  };
  const compiled = { exports: {} };
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  const items = ["a", "b", "c", "d"].map(id => ({ id, name: id.toUpperCase(), groupId: id === "d" ? "break" : "tie", groupName: id === "d" ? "Breakaway" : "Tie-down", content: id }));
  const component = compiled.exports.TemplateOrderList({ items, enabled });
  function render() { stateIndex = 0; refIndex = 0; return component.type(component.props); }
  function nodes(tree, predicate) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(item => nodes(item, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
  }
  return { render, saves, refs, done: () => Promise.all(tasks), states,
    button: (tree, label) => nodes(tree, node => node.props?.["aria-label"] === label || node.type === "button" && node.props?.children === label)[0],
    buttons: tree => nodes(tree, node => node.type === "button"),
  };
}


function begin(h) {
 h.buttons(h.render()).find(button => !button.props.disabled).props.onClick();
 return h.render();
}
function move(h) {
 h.button(h.render(), "Reorder B, position 2 of 3").props.onKeyDown({ key: "ArrowUp", preventDefault() {} });
}
test("division draft saves only on Save order and retains other divisions", async () => {
 const h = harness(); begin(h); move(h);
 assert.deepEqual(h.saves, []);
 h.button(h.render(), "Save order").props.onClick(); await h.done();
 assert.deepEqual(h.saves, [["b", "a", "c", "d"]]);
 assert.equal(h.states[1], null);
});
for (const result of [{ message: "Manager access is required." }, new Error("offline")]) {
 test(`failed save retains the editable draft (${result.message})`, async () => {
  const h = harness(result); begin(h); move(h);
  h.button(h.render(), "Save order").props.onClick(); await h.done();
  assert.deepEqual(h.states[0], ["a", "b", "c", "d"]);
  assert.deepEqual(h.states[2], ["b", "a", "c"]);
  assert.equal(h.states[1], "tie");
  assert.match(h.states[3], /Manager access|Unable to save/);
 });
}
test("Cancel discards draft without a save", () => {
 const h = harness(); begin(h); move(h);
 h.button(h.render(), "Cancel").props.onClick();
 assert.equal(h.states[1], null); assert.deepEqual(h.saves, []);
 assert.deepEqual(h.states[0], ["a", "b", "c", "d"]);
});
test("read-only users have no reorder controls", () => {
 const h = harness(undefined, false); assert.equal(h.buttons(h.render()).length, 0);
});
test("pointer drag updates draft on release and never autosaves", () => {
 const h = harness(); begin(h);
 h.refs[1].current = { querySelectorAll: () => ["a", "b", "c"].map((id, index) => ({ dataset: { templateOrderId: id }, getBoundingClientRect: () => ({ top: 100 + index * 100, bottom: 200 + index * 100 }) })) };
 const original = globalThis.window;
 globalThis.window = { innerHeight: 1000, scrollBy() {} };
 try {
  let handle = h.button(h.render(), "Reorder A, position 1 of 3").props;
  const event = { button: 0, pointerId: 1, clientY: 150, currentTarget: { setPointerCapture() {} } };
  handle.onPointerDown(event); handle.onPointerMove({ ...event, clientY: 370 });
  handle = h.button(h.render(), "Reorder A, position 1 of 3").props;
  handle.onPointerUp();
  assert.deepEqual(h.states[2], ["b", "c", "a"]); assert.deepEqual(h.saves, []);
 } finally { globalThis.window = original; }
});
