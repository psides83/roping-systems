import type { ReportFilters } from "@/lib/producer-reports";

export function ReportScope({ filters, season, labels = {} }: { filters: ReportFilters; season?: { starts_on: string; ends_on: string }; labels?: { season?: string; classification?: string; event?: string; fund?: string } }) {
  const financial = ["collections", "payouts", "funds"].includes(filters.report);
  const from = financial && season && (!filters.from || filters.from < season.starts_on) ? season.starts_on : filters.from;
  const through = financial && season && (!filters.through || filters.through > season.ends_on) ? season.ends_on : filters.through ?? (filters.report === "standings" ? season?.ends_on : undefined);
  const rows = [["Season", filters.season ? labels.season ?? "Selected season" : "All seasons"]];
  if (filters.report !== "funds") rows.push(["Classification", filters.classification ? labels.classification ?? "Selected classification" : "All classifications"]);
  if (filters.report !== "standings") rows.push(["Event", filters.event ? labels.event ?? "Selected event" : "All events"]);
  if (filters.report === "funds") rows.push(["Fund", filters.fund ? labels.fund ?? "Selected fund" : "All funds"]);
  if (filters.report !== "standings") rows.push([["collections", "payouts"].includes(filters.report) ? "Event dates from" : "From", from ?? "No start cutoff"]);
  rows.push([filters.report === "standings" ? "Standings through" : ["collections", "payouts"].includes(filters.report) ? "Event dates through" : "Through", through ?? "No end cutoff"]);
  if (filters.report === "payouts") rows.push(["Payment", ({ due: "Unpaid", partial: "Partially paid", paid: "Paid" } as Record<string, string>)[filters.status ?? ""] ?? "All awards"]);
  if (filters.search) rows.push(["Search", filters.search]);
  return <section aria-labelledby="report-scope-title" className="space-y-3 rounded-md border border-[#dfe4e1] bg-white p-4"><h2 id="report-scope-title" className="font-bold">Applied report scope</h2><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold text-[#66716b]">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value}</dd></div>)}</dl><p className="border-t border-[#e7ebe8] pt-3 text-sm leading-6 text-[#526059]">Preview and CSV use this applied scope. After changing the form, choose Apply filters before downloading. The CSV includes all matching rows, not only the preview.</p></section>;
}
