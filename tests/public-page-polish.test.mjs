import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as standings from "../src/lib/events/public-standings.ts";
import * as money from "../src/lib/events/public-money-results.ts";
const require = createRequire(import.meta.url);
function component(file, mocks = {}) {
  const compiled = { exports: {} };
  const source = readFileSync(new URL(`../src/components/events/${file}.tsx`, import.meta.url), "utf8");
  new Function("require", "module", "exports", transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  }).outputText)((name) => mocks[name] ?? require(name), compiled, compiled.exports);
  return compiled.exports;
}
const entry = { EntryLabel: ({ number }) => React.createElement("span", null, `#${number}`) };
test("Mobile full results retain entry, aggregate, progress, and ordered winnings without a wide table", () => {
  const { PublicRopingResults } = component("public-roping-results", {
    "./entry-label": entry, "@/lib/scoring": { formatFinalTimeAdjustment: String },
    "@/lib/events/public-standings": standings, "@/lib/events/public-money-results": money,
  });
  const html = renderToStaticMarkup(React.createElement(PublicRopingResults, {
    results: [{ resultId: "entry", divisionId: "roping", divisionName: "#11.5 Tie-down", name: "Wyatt Reed", entryNumber: 2,
      resultStatus: "official", totalTime: 22.45, incentiveAdjustment: 0, status: "no_time", roundsCompleted: 2, mainRoundCount: 3 }],
    runs: [], awards: [
      { entryId: "entry", planId: "side", poolType: "side_pot", poolName: "Side Pot", sectionType: "aggregate", payoutCents: 10000 },
      { entryId: "entry", planId: "main", poolType: "main", sectionType: "aggregate", payoutCents: 20000 },
    ],
  }));
  for (const expected of ["Wyatt Reed", "22.45", "On two", "Entry", "#2", "$200.00", "$100.00"]) assert.ok(html.includes(expected));
  assert.ok(html.indexOf("$200.00") < html.indexOf("$100.00"));
  assert.doesNotMatch(html, /min-w-\[520px\]/);
  assert.match(html, /table-fixed/);
});
test("Missing fixed start times do not falsely follow another roping", () => {
  const { PublicClassSchedule } = component("public-class-schedule", {
    "@/lib/events/arena-schedule": { groupScheduleByArena: (events) => [{ name: "Arena 1", ropings: events }] },
    "@/lib/events/qualification-notice": { qualificationNoticeText: () => "" },
  });
  const render = (scheduleType) => renderToStaticMarkup(React.createElement(PublicClassSchedule, {
    events: [{ id: "roping", name: "Open Breakaway", scheduleType, startsAt: null, eventDayStatus: "scheduled", followsRopingName: "#11 Tie-down" }],
  }));
  assert.match(render("fixed"), /Start time to be announced/);
  assert.doesNotMatch(render("fixed"), /Follows/);
  assert.match(render("follows_previous"), /Follows #11 Tie-down/);
});
test("Public navigation shares branding and comfortable mobile links", () => {
  const { PublicProducerHeader } = component("public-producer-header", {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { default: () => null },
    "@/components/ui/navigation-pending": { NavigationPending: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(PublicProducerHeader, {
    slug: "producer", name: "Calf Roping Association", active: "standings", membershipPublished: true,
  }));
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Membership/);
  assert.match(html, /aria-label="Roper portal"/);
  assert.match(html, /min-h-11/);
});
test("A larger schedule offers month navigation without adding a redundant single-month control", () => {
  const { PublicScheduleJump } = component("public-schedule-jump");
  const events = [{ id: "event", label: "Fall Roping" }];
  const months = [{ id: "2026-10", label: "October 2026" }, { id: "2026-11", label: "November 2026" }];
  const html = renderToStaticMarkup(React.createElement(PublicScheduleJump, { events, months }));
  assert.match(html, /Jump to month/);
  assert.match(html, /October 2026/);
  assert.match(html, /November 2026/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(PublicScheduleJump, { events, months: months.slice(0, 1) })), /Jump to month/);
});
