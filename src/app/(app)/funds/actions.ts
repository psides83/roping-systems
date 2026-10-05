"use server";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { moneyInputCents } from "@/lib/member-fines";

export async function saveFundChange(operation: string, fundId: string | null, reference: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Manager access is required." };
  const supabase = await createClient();
  let result;
  if (operation === "create" || operation === "edit") {
    const name = String(form.get("name") ?? "").trim();
    if (!name || name.length > 120) return { error: "Provide a fund name of up to 120 characters." };
    if (operation === "edit") {
      const { data } = await supabase.from("producer_funds").select("id").eq("id", fundId).eq("producer_id", producer.id).single();
      if (!data) return { error: "Fund not found." };
    }
    result = await supabase.rpc("manage_producer_fund", { target_producer_id: producer.id, target_fund_id: fundId ?? reference,
      target_name: name, target_description: String(form.get("description") ?? ""), target_active: form.get("active") === "on" });
  } else {
    if (!["manual_deposit", "manual_debit", "reversal"].includes(operation)) return { error: "Choose a valid action." };
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 5 || reason.length > 2000) return { error: "Provide a clearly explained reason (5-2,000 characters)." };
    const amount = moneyInputCents(String(form.get("amount") ?? ""));
    if (operation !== "reversal" && amount === null) return { error: "Enter a positive amount with at most two decimal places." };
    result = await supabase.rpc("record_fund_transaction", { target_fund_id: fundId, target_transaction_id: reference,
      target_kind: operation, target_amount_cents: amount, target_reason: reason, target_reverses_id: operation === "reversal" ? String(form.get("reversesId") ?? "") : null });
  }
  if (result.error) return { error: result.error.code === "23505" ? "A fund with that name already exists." : result.error.message };
  revalidatePath("/funds", "layout");
  revalidatePath("/settings/roping-templates");
  return { success: true };
}
