import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { reportDate, reportInPeriod, reportTypes, type ReportFilters, type ProducerReport } from "@/lib/producer-reports";
import type { loadReportOptions } from "@/lib/producer-report-options";
import type { FeeCollection } from "@/lib/events/fee-collections";
import { compareMoneyPools } from "@/lib/events/public-money-results";

type Options = NonNullable<Awaited<ReturnType<typeof loadReportOptions>>>;
interface LedgerRow { id: string; kind: string; amount_cents: number; reason: string; created_at: string; staff_label: string;
  event_roping_id: string | null; roping_name: string | null; event_id: string | null; event_title: string | null; balance_cents: number; reversed: boolean }
interface Award { plan_id: string; event_roping_id: string; roping_name: string; pool_name: string; pool_type: string;
  entry_id: string; roper_id: string; contestant_name: string; member_number: string | null; section_type: string;
  round_number: number | null; d_number: number | null; place_number: number; award_key: string; payout_cents: number; paid_cents: number }

export async function loadFinancialReport(options: Options, requested: ReportFilters): Promise<ProducerReport> {
  const db = await createClient();
  const season = options.seasons.find(season => season.id === requested.season);
  const filters = { ...requested, from: season && (!requested.from || requested.from < season.starts_on) ? season.starts_on : requested.from,
    through: season && (!requested.through || requested.through > season.ends_on) ? season.ends_on : requested.through };
  const timezone = options.producer.timezone;
  if (filters.report === "funds") {
    const report: ProducerReport = { title: reportTypes.funds, columns: ["Producer", "Fund", "Local date", "Recorded at (UTC)", "Type", "Deposit", "Debit", "Account balance after transaction", "Reason", "Staff", "Reversed", "Event", "Roping", "Transaction ID", "Fund ID", "Event ID", "Roping ID"], rows: [] };
    for (const fund of options.funds.filter(fund => !filters.fund || fund.id === filters.fund)) {
      // The ledger calculates each balance over its entire history before filters, not just the exported period.
      for (let offset = 0; ; offset += 100) {
        const result = await db.rpc("producer_fund_ledger", { target_fund_id: fund.id, target_offset: offset });
        if (result.error) throw new Error("Unable to export fund activity.");
        const rows = (result.data ?? []) as LedgerRow[];
        for (const row of rows.filter(row => reportInPeriod(reportDate(row.created_at, timezone), filters) && (!filters.event || row.event_id === filters.event)))
          report.rows.push([options.producer.name, fund.name, reportDate(row.created_at, timezone), row.created_at, row.kind.replaceAll("_", " "), Math.max(0, Number(row.amount_cents)) / 100,
            Math.max(0, -Number(row.amount_cents)) / 100, Number(row.balance_cents) / 100, row.reason, row.staff_label, row.reversed, row.event_title, row.roping_name, row.id, fund.id, row.event_id, row.event_roping_id]);
        if (rows.length < 100) break;
      }
    }
    return report;
  }
  const events = options.events.filter(event => (!filters.event || event.id === filters.event)
    && (!filters.from || reportDate(event.ends_at ?? event.starts_at, timezone) >= filters.from)
    && (!filters.through || reportDate(event.starts_at, timezone) <= filters.through));
  const report: ProducerReport = filters.report === "collections"
    ? { title: reportTypes.collections, columns: ["Producer", "Event", "Event start date", "Roping", "Fee", "Type", "Main purse contribution", "Assessed", "Waived", "Collected", "Outstanding", "Charge count", "Partial payments present", "Event ID", "Roping ID", "Fee ID"], rows: [] }
    : { title: reportTypes.payouts, columns: ["Producer", "Event", "Roping", "Contestant", "Member number", "Pool", "Pool type", "Stage", "Round", "D", "Place", "Awarded", "Paid", "Remaining", "Status", "Event ID", "Roping ID", "Entry ID", "Plan ID", "Award key"], rows: [] };
  for (const event of events) {
    const ropings = filters.classification ? await readAllRows<{ id: string; classification_id: string | null; division_id: string; competition_format: string }>((first, last) => db.from("event_ropings")
      .select("id,classification_id,division_id,competition_format").eq("producer_id", options.producer.id).eq("event_id", event.id).order("id").range(first, last), "Unable to filter report ropings") : [];
    const matchesClass = (ropingId: string | null) => !filters.classification || ropings.some(row => row.id === ropingId
      && (row.competition_format === "handicap" || row.competition_format === "four_d" ? `${row.division_id}:${row.competition_format}` : row.classification_id) === filters.classification);
    if (filters.report === "collections") {
      const fees = await readAllRows<FeeCollection>((first, last) => db.rpc("event_fee_collection_summary", { target_event_id: event.id }).order("fee_id").range(first, last), "Unable to export collections");
      for (const fee of fees.filter(fee => matchesClass(fee.event_roping_id))) report.rows.push([options.producer.name, event.title, reportDate(event.starts_at, timezone), fee.roping_name ?? "Event-wide", fee.title,
        fee.kind.replaceAll("_", " "), fee.contributes_to_payout, Number(fee.assessed_cents) / 100, Number(fee.waived_cents) / 100, Number(fee.collected_cents) / 100,
        Number(fee.outstanding_cents) / 100, Number(fee.charge_count), fee.partial_payments, event.id, fee.event_roping_id, fee.fee_id]);
    } else {
      const awards = await readAllRows<Award>((first, last) => db.rpc("event_payout_register_awards", { target_event_id: event.id }).order("plan_id").order("award_key").range(first, last), "Unable to export payouts");
      for (const award of awards.filter(award => matchesClass(award.event_roping_id)).sort((a, b) => a.roping_name.localeCompare(b.roping_name)
        || a.contestant_name.localeCompare(b.contestant_name) || compareMoneyPools({ poolType: a.pool_type, poolName: a.pool_name }, { poolType: b.pool_type, poolName: b.pool_name })
        || a.entry_id.localeCompare(b.entry_id) || a.award_key.localeCompare(b.award_key))) {
        const paid = Number(award.paid_cents); const amount = Number(award.payout_cents);
        const status = paid > amount ? "Review required" : paid === amount ? "paid" : paid > 0 ? "partial" : "due";
        if (filters.status !== "all" && filters.status !== status) continue;
        report.rows.push([options.producer.name, event.title, award.roping_name, award.contestant_name, award.member_number, award.pool_name, award.pool_type, award.section_type.replaceAll("_", " "),
          award.round_number, award.d_number, award.place_number, amount / 100, paid / 100, Math.max(0, amount - paid) / 100, status, event.id, award.event_roping_id, award.entry_id, award.plan_id, award.award_key]);
      }
    }
  }
  return report;
}
