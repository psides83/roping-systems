import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

for (const file of ["create-roping-dialog", "event-details-dialog"]) {
  test(`${file} submits without triggering React's automatic form reset`, () => {
    const source = readFileSync(new URL(`../src/components/events/${file}.tsx`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let handler;
    function visit(node) {
      if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "form") {
        assert.ok(!node.attributes.properties.some(p => p.name?.getText(ast) === "action"));
        handler = node.attributes.properties.find(p => p.name?.getText(ast) === "onSubmit")?.initializer.expression;
      }
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(handler);
    let submitted, prevented = false;
    const pending = false;
    const data = new FormData();
    data.set("venueName", "Circle T"); data.set("eventFeeAmount", "20.00");
    data.set("classOccurrences", "scheduled ropings"); data.set("qualificationRuleSetId", "rules");
    const javascript = ts.transpileModule(`const submit = ${handler.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const dispatch = value => { submitted = value; };
    const submit = new Function("pending", "FormData", "startTransition", "action", "formAction", `${javascript}\nreturn submit;`)(pending, class { constructor(form) { return form; } }, callback => callback(), dispatch, dispatch);
    submit({ preventDefault: () => { prevented = true; }, currentTarget: data });
    assert.equal(prevented, true); assert.equal(submitted, data);
    assert.equal(data.get("venueName"), "Circle T");
    assert.equal(data.get("qualificationRuleSetId"), "rules");
  });
}
