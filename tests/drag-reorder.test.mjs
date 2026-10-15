import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
const require = createRequire(import.meta.url);
function load(path, imports) {
  const compiled = { exports: {} };
  const source = transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", source)(imports, compiled, compiled.exports);
  return compiled.exports;
}
const { moveItem } = load("../src/lib/reorder.ts", require);
test("moving multiple positions inserts the item and preserves other rows", () => {
  const items = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(items, 0, 3), ["b", "c", "d", "a"]);
  assert.deepEqual(moveItem(items, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(items, ["a", "b", "c", "d"]);
  assert.equal(moveItem(items, -1, 2), items);
});

function handle(disabled = false) {
  const moved = [];
  const { ReorderHandle } = load("../src/components/ui/reorder-handle.tsx", name => {
    if (name === "react") return { useRef: initial => ({ current: initial }), useEffect() {} };
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
    if (name === "lucide-react") return { GripVertical: "grip" };
    throw new Error(name);
  });
  const props = ReorderHandle({ id: "a", group: "arena-1", label: "A", disabled, onMove: target => moved.push(target) }).props;
  const event = { button: 0, pointerId: 1, clientX: 10, clientY: 150, stopPropagation() {}, currentTarget: { setPointerCapture() {} } };
  return { props, moved, event };
}
function row(group, id = "b") {
  const classes = new Set();
  return { classes, dataset: { reorderGroup: group, reorderId: id }, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) } };
}
for (const mode of ["drop", "cancel", "foreign", "disabled", "outside", "same"]) {
  test(`drag handles ${mode} without changing unrelated groups`, () => {
    const h = handle(mode === "disabled");
    const target = row(mode === "foreign" ? "arena-2" : "arena-1", mode === "same" ? "a" : "b");
    globalThis.document = { elementFromPoint: () => mode === "outside" ? null : { closest: () => target } };
    globalThis.window = { innerHeight: 900, scrollBy() {} };
    try {
      h.props.onPointerDown(h.event);
      h.props.onPointerMove({ ...h.event, clientY: 300 });
      if (mode === "cancel") h.props.onPointerCancel();
      h.props.onPointerUp();
      assert.deepEqual(h.moved, mode === "drop" ? ["b"] : []);
      assert.equal(target.classes.size, 0);
    } finally { delete globalThis.document; delete globalThis.window; }
  });
}

const uuid = number => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function actionHarness() {
  const data = [
    { id: uuid(1), scheduled_date: "2026-10-17", arena_name: "Arena 1" },
    { id: uuid(2), scheduled_date: "2026-10-17", arena_name: "Arena 2" },
    { id: uuid(3), scheduled_date: "2026-10-17", arena_name: "Arena 1" },
    { id: uuid(4), scheduled_date: "2026-10-17", arena_name: "Arena 1" },
    { id: uuid(5), scheduled_date: "2026-10-18", arena_name: "Arena 1" },
  ];
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, then(resolve) { resolve({ data, error: null }); } };
  const db = { from: () => query, rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } };
  const actions = load("../src/app/(app)/events/[eventId]/actions.ts", name => {
    if (name === "zod") return require(name);
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "@/lib/staff-access") return { eventStaffAccess: async () => ({ supabase: db }) };
    if (name === "@/lib/utils") return { formatProperNoun: value => value };
    return {};
  });
  return { actions, calls };
}
test("schedule drop inserts within its arena and preserves other arenas", async () => {
  const h = actionHarness();
  const result = await h.actions.moveEventRoping(uuid(9), uuid(1), "up", uuid(4));
  assert.equal(result.success, true);
  assert.deepEqual(h.calls[0].args.ordered_event_roping_ids, [uuid(3), uuid(2), uuid(4), uuid(1), uuid(5)]);
});
for (const target of [uuid(2), uuid(5), uuid(99)]) {
  test(`schedule drop rejects unavailable or out-of-group destination ${target}`, async () => {
    const h = actionHarness();
    const result = await h.actions.moveEventRoping(uuid(9), uuid(1), "up", target);
    assert.equal(result.success, undefined);
    assert.equal(h.calls.length, 0);
  });
}
test("existing schedule arrows still skip other arenas", async () => {
  const h = actionHarness();
  const result = await h.actions.moveEventRoping(uuid(9), uuid(1), "down");
  assert.equal(result.success, true);
  assert.deepEqual(h.calls[0].args.ordered_event_roping_ids, [uuid(3), uuid(2), uuid(1), uuid(4), uuid(5)]);
});
