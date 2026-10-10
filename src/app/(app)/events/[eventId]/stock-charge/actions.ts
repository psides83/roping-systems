"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";

export async function stockChargeAction(eventId: string, operation: string, _state: { message?: string; success?: boolean }, form: FormData): Promise<{ message?: string; success?: boolean }> {
  const producer = await getActiveProducer();
  if (!producer) return { message: "Sign in to manage stock charge runs." };
  const db = await createClient();
  const event = await db.from("events").select("id").eq("id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (!event.data) return { message: "Event access is required." };
  const payload: Record<string, string | boolean | number> = Object.fromEntries([...form].filter(([, value]) => typeof value === "string")) as Record<string, string>;
  if (operation === "settings") payload.enabled = form.get("enabled") === "on";
  for (const key of ["firstName", "lastName", "title"]) if (typeof payload[key] === "string") payload[key] = formatProperNoun(payload[key]);
  if (operation === "package" && !form.get("id")) {
    const amount = Number(form.get("price"));
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return { message: "Enter a price with no more than two decimal places." };
    payload.amountCents = Math.round(amount * 100);
  }
  const { error } = await db.rpc("manage_event_stock", { target_event: eventId, operation, payload });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}`, "layout");
  revalidatePath("/reports");
  return { success: true, message: "Saved." };
}
