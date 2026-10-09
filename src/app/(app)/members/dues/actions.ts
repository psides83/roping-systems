"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { nonnegativeMoney } from "@/lib/membership-dues";

export async function duesAction(operation: string, reference: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || (producer.role === "viewer" && !producer.treasurer)) return { error: "Finance access is required." };
  const value = (key: string) => String(form.get(key) ?? "");
  const uuid = (key: string) => z.uuid().safeParse(value(key)).success;
  const client = await createClient();
  let result;
  if (operation === "settings") {
    if (!["owner", "admin"].includes(producer.role)) return { error: "Administrator access is required." };
    const amount = nonnegativeMoney(value("amount"));
    const allocation = nonnegativeMoney(value("allocation"));
    const mode = value("mode");
    const revision = Number(value("revision"));
    if (!Number.isInteger(revision) || revision < 0 || amount === null || amount <= 0 || allocation === null || !["fixed", "percent"].includes(mode) || allocation > (mode === "fixed" ? amount : 10000) || (allocation > 0 && !uuid("fund"))) return { error: "Check the dues amount, allocation, and destination fund." };
    result = await client.rpc("save_dues_settings", { target_producer: producer.id, expected_revision: revision, amount, allow_installments: form.get("installments") === "on", mode, allocation, target_fund: allocation > 0 ? value("fund") : null });
  } else if (operation === "assess") {
    if (!uuid("member") || !uuid("season") || (value("fund") && !uuid("fund"))) return { error: "Choose a member, season, and valid destination fund." };
    result = await client.rpc("assess_membership_dues", { target_producer: producer.id, target_member: value("member"), target_season: value("season"), target_fund: value("fund") || null });
  } else if (operation === "payment" || operation === "reversal") {
    const amount = nonnegativeMoney(value("amount"));
    if (!z.uuid().safeParse(reference).success || !uuid("dues") || value("reason").trim().length < 5 || value("reason").length > 2000 || (operation === "reversal" ? !uuid("reverses") : amount === null || amount <= 0 || !["cash", "check", "card", "other"].includes(value("method")))) return { error: "Provide a valid payment and a reason of at least five characters." };
    result = await client.rpc("record_dues_payment", { target_producer: producer.id, target_dues: value("dues"), reference, amount: operation === "reversal" ? null : amount, payment_method: operation === "reversal" ? "reversal" : value("method"), note: value("reason"), reversal: operation === "reversal" ? value("reverses") : null });
  } else return { error: "Unknown dues action." };
  if (result.error) return { error: result.error.message };
  revalidatePath("/members/dues");
  revalidatePath("/settings/dues");
  revalidatePath("/funds", "layout");
  return { success: true };
}
