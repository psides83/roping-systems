import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const producer = args.find((arg) => arg.startsWith("--producer="))?.slice(11);
const retained = args.includes("--seed");
const replace = args.includes("--replace-tests");
const allowed = args.every((arg) => arg === "--seed" || arg === "--replace-tests" || arg === "--local" || arg.startsWith("--producer="));
if (!producer || !/^[a-z0-9-]+$/.test(producer) || !allowed) {
  console.error("Usage: npm run test:events -- --producer=producer-slug [--seed] [--replace-tests] [--local]");
  process.exit(1);
}
const directory = mkdtempSync(join(tmpdir(), "roping-event-tests-"));
try {
  const sql = [
    "begin; set local statement_timeout = '600s';",
    `select set_config('test.producer_slug', '${producer}', true);`,
    `select set_config('test.retain', '${retained}', true);`,
    readFileSync(new URL("../supabase/tests/event-day/members.sql", import.meta.url), "utf8"),
    ...(replace ? [readFileSync(new URL("../supabase/tests/event-day/reset.sql", import.meta.url), "utf8")] : []),
    readFileSync(new URL("../supabase/tests/event-day/competition.sql", import.meta.url), "utf8"),
    readFileSync(new URL("../supabase/tests/event-day/funding.sql", import.meta.url), "utf8"),
    readFileSync(new URL("../supabase/tests/event-day/public.sql", import.meta.url), "utf8"),
    "set constraints all immediate;",
    "select jsonb_agg(to_jsonb(report) order by sequence) as report from test_report report;",
    retained ? "commit;" : "rollback;",
  ].join("\n");
  const path = join(directory, "event-tests.sql");
  writeFileSync(path, sql);
  console.log(retained ? "Creating retained public test events. Replacement, when requested, is scoped to identified test events."
    : "Running event-day tests; generated data will be rolled back.");
  const result = spawnSync(join(process.cwd(), "node_modules/.bin/supabase"),
    ["db", "query", args.includes("--local") ? "--local" : "--linked", "--file", path],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status === 0) {
    const response = JSON.parse(result.stdout);
    const report = response.rows?.[0]?.report;
    if (!Array.isArray(report)) throw new Error("The database did not return a test report.");
    for (const { scenario, detail } of report) {
      console.log(`${scenario === "Configuration warning" ? "WARN" : "PASS"}: ${scenario} - ${JSON.stringify(detail)}`);
    }
    const warnings = report.filter((row) => row.scenario === "Configuration warning");
    if (warnings.length) console.log(`Configuration gaps: ${warnings.length}. Affected dollar payout checks are NOT fully validated.`);
    console.log(retained ? "Fixtures saved. Completed results and live/upcoming test schedules are published." : "All fixture changes rolled back.");
  } else process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
