"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { moneyInputCents } from "@/lib/member-fines";

export type FineOperation = "issue" | "payment" | "waiver" | "reversal" | "exception" | "revoke";

export async function saveMemberFine(membershipId: string, operation: FineOperation, fineId: string | null,
  reference: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "You do not have permission to manage fines." };
  const supabase = await createClient();
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("id", membershipId).eq("producer_id", producer.id).single();
  if (!membership) return { error: "Member not found." };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5 || reason.length > 2000) return { error: "Provide a clearly explained reason (5–2,000 characters)." };
  if (operation !== "issue") {
    const { data: fine } = await supabase.from("member_fines").select("id")
      .eq("id", fineId).eq("membership_id", membershipId).eq("producer_id", producer.id).single();
    if (!fine) return { error: "Fine not found." };
  }
  const amount = moneyInputCents(String(form.get("amount") ?? ""));
  if (["issue", "payment", "waiver"].includes(operation) && amount === null) return { error: "Enter a positive amount with at most two decimal places." };
  let result;
  if (operation === "issue") {
    result = await supabase.rpc("issue_member_fine", {
      target_membership_id: membershipId, target_amount_cents: amount,
      target_reason: reason, target_restriction: String(form.get("restriction") ?? "none"),
      target_origin_roping_id: String(form.get("ropingId") ?? "") || null, target_fine_id: reference,
    });
  } else if (operation === "exception" || operation === "revoke") {
    const expires = String(form.get("expiresAt") ?? "");
    if (operation === "exception" && (!expires || Number.isNaN(Date.parse(expires)))) return { error: "Choose a valid expiry date and time." };
    result = await supabase.rpc("manage_member_fine_exception", {
      target_fine_id: fineId, target_exception_id: operation === "revoke" ? String(form.get("exceptionId")) : reference,
      target_event_roping_id: String(form.get("ropingId") ?? "") || null,
      target_expires_at: operation === "exception" ? new Date(expires).toISOString() : null,
      target_reason: reason, target_revoke: operation === "revoke",
    });
  } else {
    result = await supabase.rpc("record_member_fine_transaction", {
      target_fine_id: fineId, target_kind: operation, target_amount_cents: amount,
      target_reason: reason, target_reverses_id: operation === "reversal" ? String(form.get("transactionId")) : null,
      target_transaction_id: reference,
    });
  }
  if (result.error) return { error: result.error.message };
  revalidatePath("/", "layout");
  return { success: true };
}
