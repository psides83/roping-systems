import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { ReportType, ReportFilters } from "@/lib/producer-reports";

export function canExportReport(role: string, treasurer: boolean | undefined, type: ReportType) {
  return type === "standings" || type === "attendance" || ["owner", "admin", "operator"].includes(role) || Boolean(treasurer);
}
export async function loadReportOptions() {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const db = await createClient();
  const seasons = await readAllRows<{ id: string; name: string; starts_on: string; ends_on: string }>((first, last) => db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false }).order("id").range(first, last), "Unable to load report seasons");
  const divisions = await readAllRows<{ id: string; name: string }>((first, last) => db.from("divisions").select("id,name").eq("producer_id", producer.id).order("id").range(first, last), "Unable to load report divisions");
  const classificationRows = await readAllRows<{ id: string; name: string; division_id: string }>((first, last) => db.from("classifications").select("id,name,division_id").eq("producer_id", producer.id).eq("standalone_enabled", true).order("rank", { ascending: false }).order("id").range(first, last), "Unable to load report classifications");
  const names = new Map(divisions.map(row => [row.id, row.name]));
  const classifications = classificationRows.map(row => ({ id: row.id, name: `${row.name} ${names.get(row.division_id) ?? ""}` }));
  for (const division of divisions) for (const [format, label] of [["handicap", "Handicap"], ["four_d", "4-D"]]) classifications.push({ id: `${division.id}:${format}`, name: `${label} ${division.name}` });
  const events = await readAllRows<{ id: string; title: string; starts_at: string; ends_at: string | null }>((first, last) => db.from("events").select("id,title,starts_at,ends_at").eq("producer_id", producer.id).order("starts_at", { ascending: false }).order("id").range(first, last), "Unable to load report events");
  const funds = canExportReport(producer.role, producer.treasurer, "funds") ? await readAllRows<{ id: string; name: string }>((first, last) => db.from("producer_funds").select("id,name").eq("producer_id", producer.id).order("name").order("id").range(first, last), "Unable to load report funds") : [];
  return { producer, seasons, classifications, events, funds };
}
export function validateReportSelection(options: NonNullable<Awaited<ReturnType<typeof loadReportOptions>>>, filters: ReportFilters) {
  if (filters.producer && filters.producer !== options.producer.id) throw new Error("The active producer changed. Refresh the report before exporting.");
  if (!canExportReport(options.producer.role, options.producer.treasurer, filters.report)) throw new Error("Finance access is required for this report.");
  for (const [value, rows, label] of [[filters.season, options.seasons, "season"], [filters.classification, options.classifications, "classification"], [filters.event, options.events, "event"], [filters.fund, options.funds, "fund"]] as const)
    if (value && !rows.some(row => row.id === value)) throw new Error(`Choose a ${label} belonging to the active producer.`);
  if (["standings", "attendance"].includes(filters.report) && !filters.season) throw new Error("Choose a season.");
}
