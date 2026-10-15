import Link from "next/link";
import { ReportScope } from "@/components/reports/report-scope";
import { ContextHelp } from "@/components/help/context-help";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ReportDownload } from "@/components/reports/report-download";
import { ReportTypeSelect } from "@/components/reports/report-type-select";
import { loadReportOptions, canExportReport } from "@/lib/producer-report-options";
import { loadProducerReport } from "@/lib/producer-report-data";
import { reportTypes, parseReportFilters, formatReportCell, type ProducerReport } from "@/lib/producer-reports";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const options = await loadReportOptions();
  if (!options) notFound();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  params.set("producer", options.producer.id);
  if (!params.has("season") && options.seasons[0]) params.set("season", options.seasons[0].id);
  let error = ""; let report: ProducerReport | undefined;
  let filters;
  try { filters = parseReportFilters(params); report = (await loadProducerReport(filters)).report; }
  catch (failure) { error = failure instanceof Error ? failure.message : "Unable to load report."; }
  const type = filters?.report ?? "standings";
  const seasonal = type === "standings" || type === "attendance";
  const selectClass = "h-11 w-40 max-w-full rounded-md border bg-white pl-3 pr-9 text-sm font-normal";
  return <div className="space-y-5">
    <PageHeader title="Reports & exports" eyebrow={options.producer.name} description={type === "standings" ? "Official season standings" : type === "attendance" ? "Official roping attendance counts" : type === "payouts" ? "Awards from completed ropings" : type === "funds" ? "Recorded fund transactions" : "Event fee collections"} actions={<ReportDownload href={`/api/reports?${params}`} disabled={!report} />} />
    <ContextHelp title="Which figures am I exporting?" guide="reports"><p>Standings, attendance, calculated awards, recorded fund transactions, and fee collections answer different questions. Review the report type and applied scope before using the totals.</p><p>The preview shows up to 50 rows. Download CSV exports every matching row using the applied filters.</p></ContextHelp>
    <ReportTypeSelect type={type} defaultSeason={options.seasons[0]?.id} choices={Object.entries(reportTypes).filter(([key]) => canExportReport(options.producer.role, options.producer.treasurer, key as keyof typeof reportTypes)).map(([id, name]) => ({ id, name }))} />
    <form key={params.toString()} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="report" value={type} />
      <input type="hidden" name="producer" value={options.producer.id} />
      <label className="grid max-w-full gap-1 text-sm font-semibold">Season<select name="season" defaultValue={params.get("season") ?? "all"} className={selectClass}>{!seasonal && <option value="all">All seasons</option>}{options.seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
      {type !== "funds" && <label className="grid max-w-full gap-1 text-sm font-semibold">Classification<select name="classification" defaultValue={params.get("classification") ?? "all"} className={selectClass}><option value="all">All classifications</option>{options.classifications.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      {type !== "standings" && <label className="grid max-w-full gap-1 text-sm font-semibold">Event<select name="event" defaultValue={params.get("event") ?? "all"} className={selectClass}><option value="all">All events</option>{options.events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>}
      {type === "funds" && <label className="grid max-w-full gap-1 text-sm font-semibold">Fund<select name="fund" defaultValue={params.get("fund") ?? "all"} className={selectClass}><option value="all">All funds</option>{options.funds.map(fund => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>}
      {type !== "standings" && <label className="grid gap-1 text-sm font-semibold">{["collections", "payouts"].includes(type) ? "Event dates from" : "From"}<input type="date" name="from" defaultValue={params.get("from") ?? ""} className="h-11 w-40 rounded-md border bg-white px-3 text-sm font-normal" /></label>}
      <label className="grid gap-1 text-sm font-semibold">{type === "standings" ? "Standings through" : ["collections", "payouts"].includes(type) ? "Event dates through" : "Through"}<input type="date" name="through" defaultValue={params.get("through") ?? ""} className="h-11 w-40 rounded-md border bg-white px-3 text-sm font-normal" /></label>
      {type === "payouts" && <label className="grid gap-1 text-sm font-semibold">Payment<select name="status" defaultValue={params.get("status") ?? "all"} className={selectClass}><option value="all">All awards</option><option value="due">Unpaid</option><option value="partial">Partially paid</option><option value="paid">Paid</option></select></label>}
      <label className="grid max-w-full gap-1 text-sm font-semibold">Search<input name="search" defaultValue={params.get("search") ?? ""} placeholder="Name or record" className="h-11 w-48 max-w-full rounded-md border bg-white px-3 text-sm font-normal" /></label>
      <button className="h-11 rounded-md border bg-white px-4 text-sm font-semibold">Apply filters</button>
      <Link href={`/reports?${new URLSearchParams({ report: type, season: seasonal && options.seasons[0] ? options.seasons[0].id : "all" })}`} className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold">Reset filters</Link>
    </form>
    {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
    {report && filters && <ReportScope filters={filters} season={options.seasons.find(item => item.id === filters.season)} labels={{ season: options.seasons.find(item => item.id === filters.season)?.name, classification: options.classifications.find(item => item.id === filters.classification)?.name, event: options.events.find(item => item.id === filters.event)?.title, fund: options.funds.find(item => item.id === filters.fund)?.name }} />}
    {report && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{report.title}</h2><span className="text-sm text-[#66716b]">{report.rows.length} rows · Preview {Math.min(50, report.rows.length)}</span></div>
      <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white"><table className="w-full text-left text-sm"><caption className="sr-only">{report.title} · First 50 matching rows</caption><thead className="border-b bg-[#f1f3f2] text-xs text-[#66716b]"><tr>{report.columns.map(column => <th scope="col" key={column} className="whitespace-nowrap px-4 py-3 font-semibold">{column}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0ee]">{report.rows.slice(0, 50).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="max-w-sm whitespace-nowrap px-4 py-3">{formatReportCell(report.columns[column], cell)}</td>)}</tr>)}{!report.rows.length && <tr><td colSpan={report.columns.length} className="p-8 text-center text-[#66716b]">No records match these filters. Reset filters or choose a different season or report.</td></tr>}</tbody></table></div>
    </section>}
  </div>;
}
