"use server";

import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { eventStaffAccess } from "@/lib/staff-access";
import { createClient } from "@/lib/supabase/server";
import { summarizeReadiness, type FinalReadiness } from "@/lib/events/final-readiness";

export async function getFinalReadiness(eventId: string, ropingId?: string): Promise<{ summary?: FinalReadiness; message?: string }> {
  try {
    if (!z.uuid().safeParse(eventId).success || (ropingId && !z.uuid().safeParse(ropingId).success)) return { message: "Choose a valid event and roping." };
    const producer = await getActiveProducer();
    if (!producer || !await eventStaffAccess(eventId, "can_manage_event")) return { message: "Event management access is required." };
    const db = await createClient();
    let query = db.from("event_ropings").select("id,name,short_round_enabled,short_round_seeded_at,short_round_locked_at,payouts_finalized_at,event_roping_short_round_brackets(minimum_entries,maximum_entries),event_roping_payout_plans(id,name,pool_type)")
      .eq("event_id", eventId).eq("producer_id", producer.id).order("sort_order");
    if (ropingId) query = query.eq("id", ropingId);
    const result = await query;
    if (result.error) throw result.error;
    if (!result.data?.length) return { message: "No ropings are available to check." };
    const ropings = await Promise.all(result.data.map(async (roping) => {
      const counts = await Promise.all([
        db.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", roping.id).eq("status", "pending"),
        db.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", roping.id).eq("status", "rerun"),
        db.from("roping_entries").select("id", { count: "exact", head: true }).eq("event_roping_id", roping.id),
      ]);
      for (const count of counts) if (count.error) throw count.error;
      const entryCount = counts[2].count ?? 0;
      const shortRoundRequired = roping.short_round_enabled && entryCount > 0 && roping.event_roping_short_round_brackets.some((bracket) => entryCount >= bracket.minimum_entries && (bracket.maximum_entries === null || entryCount <= bracket.maximum_entries));
      const payoutIssues: string[] = [];
      if (entryCount > 0 && !roping.event_roping_payout_plans.some((plan) => plan.pool_type === "main")) payoutIssues.push("Main payout plan is missing.");
      for (const plan of roping.event_roping_payout_plans) {
        const calculation = await db.rpc("calculate_roping_payouts", { target_plan_id: plan.id });
        if (calculation.error) payoutIssues.push(`${plan.name}: ${calculation.error.message}`);
        else if (entryCount > 0 && !calculation.data?.length) payoutIssues.push(`${plan.name}: no payout places calculated. Review the schedule.`);
      }
      if (entryCount > 0 && !roping.payouts_finalized_at) payoutIssues.push("Payouts have not been finalized. Finalize them after completing this roping.");
      return { id: roping.id, name: roping.name, pending: counts[0].count ?? 0, reruns: counts[1].count ?? 0,
        shortRoundIssue: Boolean(shortRoundRequired && (!roping.short_round_seeded_at || !roping.short_round_locked_at)), payoutIssues };
    }));
    let receiptQuery = db.from("payout_receipts").select(ropingId ? "id,payout_receipt_awards!inner(event_roping_id)" : "id", { count: "exact", head: true })
      .eq("event_id", eventId).eq("producer_id", producer.id).eq("receipt_confirmed", false).is("reversed_at", null);
    if (ropingId) receiptQuery = receiptQuery.eq("payout_receipt_awards.event_roping_id", ropingId);
    const [receipts, awards] = await Promise.all([
      receiptQuery,
      db.rpc("event_payout_register_awards", { target_event_id: eventId }),
    ]);
    const summary = summarizeReadiness(ropings);
    if (receipts.error || awards.error) summary.paymentCheckMessage = "Payment totals could not be calculated. Review the payout register before issuing payments.";
    if (!receipts.error) summary.unconfirmedReceipts = receipts.count ?? 0;
    if (!awards.error) summary.payoutsDueCents = (awards.data ?? [])
      .filter((award: { event_roping_id: string }) => !ropingId || award.event_roping_id === ropingId)
      .reduce((total: number, award: { payout_cents: number | string; paid_cents: number | string }) => total + Math.max(0, Number(award.payout_cents) - Number(award.paid_cents)), 0);
    return { summary };
  } catch { return { message: "Readiness could not be checked. Reconnect and try again; nothing has been changed." }; }
}
