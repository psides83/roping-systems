import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

function schemaFrom(path, name, bindings = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  let expression;
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(ast) === name) expression = declaration.initializer.getText(ast);
    }
  }
  assert.ok(expression, `${name} exists`);
  const javascript = ts.transpileModule(`const schema = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("z", ...Object.keys(bindings), `${javascript}\nreturn schema;`)(z, ...Object.values(bindings));
}

test("producer names preserve branding capitalization across creation and settings", () => {
  const schemas = [
    schemaFrom("../src/app/onboarding/actions.ts", "producerSchema"),
    schemaFrom("../src/app/(app)/settings/actions.ts", "settingsSchema"),
    schemaFrom("../src/app/platform/actions.ts", "createSchema", {
      phone: z.string(), formatProperNoun: value => value.toUpperCase(),
    }),
  ];
  for (const schema of schemas) {
    for (const name of ["UCR", "myRODEO Productions", "roping systems"]) {
      assert.equal(schema.shape.name.parse(` ${name} `), name);
    }
  }
  assert.equal(schemas[1].shape.publicName.parse(" UCR Live "), "UCR Live");
});

test("platform account edits preserve producer casing while contacts still normalize", () => {
  const operations = schemaFrom("../src/app/platform/actions.ts", "operations", {
    accountStatuses: { active: "Active" }, email: z.string(), phone: z.string(),
    onboardingTasks: { setup: "Setup" }, formatProperNoun: value => value.toUpperCase(),
  });
  const account = operations.options.find(schema => schema.shape.operation.value === "account");
  const contact = operations.options.find(schema => schema.shape.operation.value === "contact");
  assert.equal(account.shape.producerName.parse(" UCR Productions "), "UCR Productions");
  assert.equal(contact.shape.name.parse("jane doe"), "JANE DOE");
});
