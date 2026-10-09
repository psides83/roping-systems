export const reportTypes = {
  standings: "Standings", attendance: "Attendance", collections: "Fee collections", payouts: "Payout awards", funds: "Fund activity",
} as const;
export type ReportType = keyof typeof reportTypes;
export type ReportCell = string | number | boolean | null;
export interface ProducerReport { title: string; columns: string[]; rows: ReportCell[][] }
export interface ReportFilters { report: ReportType; producer?: string; season?: string; classification?: string; event?: string; fund?: string; from?: string; through?: string; search?: string; status?: string }
const moneyColumns = new Set(["Winnings", "Assessed", "Waived", "Collected", "Outstanding", "Awarded", "Paid", "Remaining", "Deposit", "Debit", "Account balance after transaction"]);
export function formatReportCell(column: string, value: ReportCell) {
  if (value === null) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && moneyColumns.has(column)) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  return String(value);
}
export function reportDate(value: string | null, timezone: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function parseReportFilters(query: URLSearchParams): ReportFilters {
  const report = query.get("report") ?? "standings";
  if (!Object.hasOwn(reportTypes, report)) throw new Error("Choose a valid report.");
  const date = (key: string) => {
    const value = query.get(key);
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Choose valid report dates.");
    return value;
  };
  const from = date("from"); const through = date("through");
  if (from && through && from > through) throw new Error("The end date must be on or after the start date.");
  if (report === "standings" && from) throw new Error("Standings start at the beginning of the selected season. Use the through date for a cutoff.");
  const status = query.get("status") || "all";
  if (!["all", "due", "paid", "partial"].includes(status)) throw new Error("Choose a valid payment status.");
  const optional = (key: string) => query.get(key) && query.get(key) !== "all" ? query.get(key)! : undefined;
  return { report: report as ReportType, producer: optional("producer"), season: optional("season"), classification: optional("classification"), event: optional("event"), fund: optional("fund"), from, through,
    search: query.get("search")?.trim().slice(0, 200) || undefined, status };
}
export function reportInPeriod(date: string, filters: ReportFilters) { return (!filters.from || date >= filters.from) && (!filters.through || date <= filters.through); }
export function searchReport(report: ProducerReport, search?: string) {
  if (!search) return report;
  const term = search.toLocaleLowerCase();
  return { ...report, rows: report.rows.filter(row => row.some(cell => String(cell ?? "").toLocaleLowerCase().includes(term))) };
}
export function* reportCsvChunks(report: ProducerReport) {
  const cell = (value: ReportCell, column?: string): string => {
    if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Report contains an invalid number."); return column && moneyColumns.has(column) ? value.toFixed(2) : String(value); }
    const text = value === null ? "" : String(value);
    // Quotes alone do not stop spreadsheet formulas, including those hidden behind whitespace.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  yield "\ufeff" + report.columns.map(value => cell(value)).join(",") + "\r\n";
  for (let start = 0; start < report.rows.length; start += 250)
    yield report.rows.slice(start, start + 250).map(row => row.map((value, index) => cell(value, report.columns[index])).join(",")).join("\r\n") + "\r\n";
}
export function reportCsv(report: ProducerReport) { return [...reportCsvChunks(report)].join(""); }
