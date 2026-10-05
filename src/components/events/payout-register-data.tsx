import { createClient } from "@/lib/supabase/server";
import { PayoutRegister } from "./payout-register";
import type { PayoutReceipt, RegisterAward } from "@/lib/events/payout-register";

export async function PayoutRegisterData({ eventId, producerId, canManage }: {
  eventId: string; producerId: string; canManage: boolean;
}) {
  const supabase = await createClient();
  const [awardResult, receiptResult, finalizedResult] = await Promise.all([
    supabase.rpc("event_payout_register_awards", { target_event_id: eventId }),
    supabase.from("payout_receipts")
      .select("id, roper_id, amount_cents, payment_method, received_by, receipt_confirmed, confirmed_at, note, paid_at, paid_by_label, reversed_at, reversal_reason, payout_receipt_awards(event_roping_id, amount_cents)")
      .eq("event_id", eventId).eq("producer_id", producerId).order("paid_at", { ascending: false }),
    supabase.from("event_ropings").select("id").eq("event_id", eventId).not("payouts_finalized_at", "is", null),
  ]);
  if (awardResult.error || receiptResult.error || finalizedResult.error) {
    throw new Error(`Unable to load payout register: ${(awardResult.error ?? receiptResult.error ?? finalizedResult.error)?.message}`);
  }
  const finalized = new Set((finalizedResult.data ?? []).map(row => row.id));
  const awards: RegisterAward[] = (awardResult.data ?? []).filter((row: {event_roping_id: string}) => finalized.has(row.event_roping_id)).map((row: {
    plan_id: string; event_roping_id: string; roping_name: string; pool_name: string;
    pool_type: string; entry_id: string; roper_id: string; contestant_name: string;
    member_number: string | null; section_type: string; round_number: number | null;
    d_number: number | null; place_number: number; award_key: string;
    payout_cents: number | string; paid_cents: number | string;
  }) => ({
    planId: row.plan_id, ropingId: row.event_roping_id, ropingName: row.roping_name,
    poolName: row.pool_name, poolType: row.pool_type, entryId: row.entry_id,
    roperId: row.roper_id, name: row.contestant_name, memberNumber: row.member_number,
    sectionType: row.section_type, round: row.round_number, dNumber: row.d_number,
    place: row.place_number, awardKey: row.award_key,
    amountCents: Number(row.payout_cents), paidCents: Number(row.paid_cents),
  }));
  const receipts: PayoutReceipt[] = (receiptResult.data ?? []).map((row) => ({
    id: row.id, roperId: row.roper_id, amountCents: row.amount_cents, method: row.payment_method,
    recipient: row.received_by, confirmed: row.receipt_confirmed, confirmedAt: row.confirmed_at,
    note: row.note, paidAt: row.paid_at, staff: row.paid_by_label,
    reversedAt: row.reversed_at, reversalReason: row.reversal_reason,
    allocations: row.payout_receipt_awards.map((allocation: { event_roping_id: string; amount_cents: number }) => ({
      ropingId: allocation.event_roping_id, amountCents: allocation.amount_cents,
    })),
  }));
  return <PayoutRegister eventId={eventId} awards={awards} receipts={receipts} canManage={canManage} />;
}
