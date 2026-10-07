"use server";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { moneyInputCents } from "@/lib/member-fines";

export async function changeRopingFunding(ropingId: string, operation: string, reference: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || (producer.role === "viewer" && !producer.treasurer)) return { error: "Finance access is required." };
  const db = await createClient();
  const { data: roping } = await db.from("event_ropings").select("event_id").eq("id", ropingId).eq("producer_id", producer.id).single();
  if (!roping) return { error: "Roping not found." };
  let result;
  if (operation === "policy") {
    result = await db.rpc("set_roping_sponsor_policy", { target_roping_id: ropingId, target_allow_pledged: form.get("pledged") === "on" });
  } else if (operation === "finalize" || operation === "reopen") {
    result = await db.rpc("finalize_roping_payouts", { target_roping_id: ropingId, target_reopen: operation === "reopen", target_reason: String(form.get("reason") ?? "") });
  } else if (operation === "save" || operation === "cancel") {
    const amount = moneyInputCents(String(form.get("amount") ?? ""));
    const receivedText = String(form.get("received") ?? "0");
    const received = receivedText === "0" || /^0\.0{1,2}$/.test(receivedText) ? 0 : moneyInputCents(receivedText);
    if (operation === "save" && (amount === null || received === null)) return { error: "Enter valid amounts with at most two decimal places." };
    result = await db.rpc("save_roping_funding", { target_roping_id: ropingId, target_funding_id: reference,
      target_source: String(form.get("source") ?? "other"), target_fund_id: String(form.get("fund") ?? "") || null,
      target_sponsor_name: String(form.get("sponsor") ?? ""), target_amount_cents: amount ?? 0,
      target_received_cents: received ?? 0, target_reason: String(form.get("reason") ?? ""), target_cancel: operation === "cancel" });
  } else return { error: "Invalid action." };
  if (result.error) return { error: result.error.message };
  revalidatePath(`/events/${roping.event_id}`, "layout");
  revalidatePath("/funds", "layout");
  revalidatePath("/public", "layout");
  return { success: true };
}
