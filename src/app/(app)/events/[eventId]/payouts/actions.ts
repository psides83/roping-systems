"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { eventStaffAccess } from "@/lib/staff-access";

export async function initializePayoutPlans(eventId: string) {
  const producer = await getActiveProducer();
  if (!producer || (!await eventStaffAccess(eventId, "can_manage_event") && !await eventStaffAccess(eventId, "can_finance_event"))) return;
  const supabase = await createClient();
  await supabase.rpc("initialize_roping_payout_plans", {
    target_roping_id: eventId,
  });
  revalidatePath(`/events/${eventId}/payouts`);
}

export async function recordRoperPayout(eventId: string, roperId: string, ropingId: string | null, receiptId: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || !await eventStaffAccess(eventId, "can_finance_event")) return { error: "You do not have permission to record payouts." };
  const amount = String(form.get("amount") ?? "");
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return { error: "Enter an amount with at most two decimal places." };
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2147483647) return { error: "Enter a valid payout amount." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id").eq("id", eventId).eq("producer_id", producer.id).single();
  if (!event) return { error: "Event not found." };
  const { error } = await supabase.rpc("record_roper_payout", {
    target_event_id: eventId, target_roper_id: roperId, target_event_roping_id: ropingId,
    target_amount_cents: cents, target_payment_method: String(form.get("method") ?? "cash"),
    target_received_by: String(form.get("recipient") ?? ""),
    target_receipt_confirmed: form.get("confirmed") === "on", target_note: String(form.get("note") ?? ""),
    target_receipt_id: receiptId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/payouts`);
  return { success: true };
}

export async function updatePayoutReceipt(eventId: string, receiptId: string, action: "confirm" | "reverse", reason: string) {
  const producer = await getActiveProducer();
  if (!producer || !await eventStaffAccess(eventId, "can_finance_event")) return { error: "You do not have permission to change payouts." };
  const supabase = await createClient();
  const { data: receipt } = await supabase.from("payout_receipts").select("id")
    .eq("id", receiptId).eq("event_id", eventId).eq("producer_id", producer.id).single();
  if (!receipt) return { error: "Payment not found." };
  const { error } = await supabase.rpc("update_payout_receipt", {
    target_receipt_id: receiptId, target_action: action, target_reason: reason,
  });
  if (error) return { error: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/payouts`);
  return { success: true };
}
