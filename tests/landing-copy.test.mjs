import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const copy = readFileSync(new URL("../src/components/marketing/landing-page.tsx", import.meta.url), "utf8");
test("landing copy addresses organizations without promising self-service producer creation", () => {
  assert.match(copy, /For roping organizations and event teams/);
  assert.match(copy, /For organizations/);
  assert.match(copy, /Explore the features/);
  assert.match(copy, /href="#operations"/);
  assert.equal((copy.match(/href="\/auth\/login"/g) ?? []).length, 3);
  assert.doesNotMatch(copy, /Create a producer account|href="\/auth\/signup"/);
  assert.doesNotMatch(copy, /class-level fees|classifications, incentives, timers|Changes saved automatically/);
});
test("home metadata reflects the broader member and event management message", () => {
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /absolute: "Roping Systems \| Member and Event Management"/);
  assert.match(page, /helps organizations manage memberships/);
});
