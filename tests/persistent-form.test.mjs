import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../src/components/ui/persistent-form.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(pending = false) {
  const tasks = [], loaded = { exports: {} };
  new Function("require", "exports", source)(id => id === "react" ? { useTransition: () => [pending, callback => tasks.push(callback)] } : require(id), loaded.exports);
  return { Form: loaded.exports.PersistentForm, tasks };
}
test("failed actions retain fields, selected files and submitter outcomes without resetting", async () => {
  const { Form, tasks } = fixture();
  const previous = globalThis.FormData;
  let submitted, reset = false;
  const file = { name: "flyer.png" }, fields = { title: "Fall Finals", notes: "Keep this", file };
  globalThis.FormData = class { constructor(form, submitter) { this.fields = { ...form.fields, outcome: submitter.value }; } };
  try {
    const form = Form({ action: data => { submitted = data; throw Error("Validation failed"); }, children: null });
    assert.equal(form.props.action, undefined);
    form.props.onSubmit({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, currentTarget: { fields, reset: () => { reset = true; } }, nativeEvent: { submitter: { value: "rerun" } } });
    await assert.rejects(tasks[0](), /Validation failed/);
    assert.equal(submitted.fields.outcome, "rerun"); assert.equal(submitted.fields.file, file);
    assert.equal(fields.title, "Fall Finals"); assert.equal(reset, false);
  } finally { globalThis.FormData = previous; }
});
test("existing confirmation guards, refs and pending protection remain intact", () => {
  const { Form, tasks } = fixture(); const ref = {};
  const form = Form({ action: () => {}, ref, onSubmit: e => e.preventDefault(), children: null });
  assert.equal(form.props.ref, ref);
  const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  form.props.onSubmit(event); assert.equal(tasks.length, 0);
  const busy = fixture(true); busy.Form({ action: () => {} }).props.onSubmit({ ...event, defaultPrevented: false }); assert.equal(busy.tasks.length, 0);
});
test("no function-action forms remain outside the shared retention handler", () => {
  function scan(url) {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!entry.name.endsWith(".tsx")) continue;
      const ast = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "form") {
          const action = node.attributes.properties.find(p => p.name?.getText(ast) === "action");
          assert.ok(!action || !ts.isJsxExpression(action.initializer) || ts.isStringLiteral(action.initializer.expression), `Use PersistentForm in ${path.pathname}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  scan(new URL("../src/", import.meta.url));
});
