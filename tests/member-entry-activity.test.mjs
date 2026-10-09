import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

test("entry history filters insert noise and retains transfers and removals", async () => {
  const code = ts.transpileModule(fs.readFileSync(new URL("../src/lib/member-entry-activity.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const filters = [];
  const rows = [
    { id: 1, action: "update", created_at: "2026-10-09", before_data: { event_roping_id: "a" }, after_data: { event_roping_id: "b", event_id: "event" } },
    { id: 2, action: "delete", created_at: "2026-10-09", before_data: { event_id: "event" }, after_data: null },
    { id: 3, action: "update", created_at: "2026-10-09", before_data: { competition_status: "active" }, after_data: { competition_status: "turned_out" } },
  ];
  const chain = {};
  for (const method of ["select", "eq", "neq", "or", "order"]) chain[method] = (...args) => { filters.push([method, ...args]); return chain; };
  chain.range = async () => ({ data: rows, error: null });
  const exports = {};
  new Function("require", "exports", code)(name => {
    if (name === "@/lib/supabase/read-all-rows") return { readAllRows: async callback => (await callback(0, 499)).data };
    return {};
  }, exports);
  const items = await exports.loadMemberEntryChanges({ from: () => chain }, "producer", "member", "roper", new Map());
  assert.ok(filters.some(filter => filter[0] === "neq" && filter[1] === "action" && filter[2] === "insert"));
  assert.ok(filters.some(filter => filter[0] === "eq" && filter[1] === "producer_id" && filter[2] === "producer"));
  assert.ok(filters.some(filter => filter[0] === "or" && filter[1] === "before_data->>roper_id.eq.roper,after_data->>roper_id.eq.roper"));
  assert.deepEqual(items.map(item => item.title), ["Entry transferred", "Entry removed", "Entry status changed"]);
});
