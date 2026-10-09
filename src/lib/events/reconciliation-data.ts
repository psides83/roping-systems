import "server-only";
import { eventStaffAccess } from "@/lib/staff-access";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { reconciliationTotals, type ReconciliationFee, type ReconciliationPayment, type ReconciliationReceipt, type ReconciliationAward } from "./reconciliation";

type FundRelation = { name: string } | { name: string }[] | null;
type FundingRow = { id: string; event_roping_id: string; source: string; sponsor_name: string; amount_cents: number; received_cents: number; cancelled_at: string | null; producer_funds: FundRelation };
type TransferRow = { id: string; event_roping_id: string; kind: string; amount_cents: number | string; reason: string; created_at: string; producer_funds: FundRelation };

export async function loadEventReconciliation(eventId: string) {
  const access = await eventStaffAccess(eventId, "can_finance_event");
  if (!access) return null;
  const { supabase: db, producer } = access;
  const event = await db.from("events").select("id,title").eq("id", eventId).eq("producer_id", producer.id).single();
  if (event.error) throw new Error("Unable to load the event closeout report.");
  const fees = await readAllRows<ReconciliationFee>((first, last) => db.rpc("event_fee_collection_summary", { target_event_id: eventId }).order("fee_id").range(first, last), "Load fee collections");
  const payments = await readAllRows<ReconciliationPayment>((first, last) => db.from("event_payments").select("amount_cents,voided_at").eq("event_id", eventId).eq("producer_id", producer.id).order("id").range(first, last), "Load payments");
  const receipts = await readAllRows<ReconciliationReceipt>((first, last) => db.from("payout_receipts").select("amount_cents,reversed_at,receipt_confirmed").eq("event_id", eventId).eq("producer_id", producer.id).order("id").range(first, last), "Load payout receipts");
  const awards = await readAllRows<ReconciliationAward>((first, last) => db.rpc("event_payout_register_awards", { target_event_id: eventId }).order("plan_id").order("award_key").range(first, last), "Load winnings");
  const ropings = await readAllRows<{ id: string; name: string; payouts_finalized_at: string | null; allow_pledged_sponsor_money: boolean; event_day_status: string }>((first, last) => db.from("event_ropings").select("id,name,payouts_finalized_at,allow_pledged_sponsor_money,event_day_status").eq("event_id", eventId).eq("producer_id", producer.id).order("id").range(first, last), "Load ropings");
  // The inner relationship filters before pagination, avoiding large cross-event reads.
  const funding = await readAllRows<FundingRow>((first, last) => db.from("roping_funding").select("id,event_roping_id,source,sponsor_name,amount_cents,received_cents,cancelled_at,event_ropings!inner(event_id),producer_funds(name)").eq("event_ropings.event_id", eventId).eq("producer_id", producer.id).order("id").range(first, last), "Load added money");
  const transfers = await readAllRows<TransferRow>((first, last) => db.from("fund_transactions").select("id,event_roping_id,kind,amount_cents,reason,created_at,event_ropings!inner(event_id),producer_funds(name)").eq("event_ropings.event_id", eventId).eq("producer_id", producer.id).order("created_at").order("id").range(first, last), "Load fund transfers");
  const finalized = new Set(ropings.filter((roping) => roping.payouts_finalized_at).map((roping) => roping.id));
  const namedFunding = funding.filter((row) => !row.cancelled_at).map((row) => ({ ...row, fundName: Array.isArray(row.producer_funds) ? row.producer_funds[0]?.name : row.producer_funds?.name }));
  return { event: event.data, fees, funding: namedFunding, transfers, ropings,
    totals: reconciliationTotals(fees, payments, receipts, awards, finalized) };
}
