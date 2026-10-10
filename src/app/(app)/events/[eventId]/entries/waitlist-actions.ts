"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eventStaffAccess } from "@/lib/staff-access";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { refreshEventQualificationChecks } from "@/lib/events/qualification-checks";

export interface WaitlistState { success?: boolean; message?: string }

export async function setEntryLimit(eventId: string, _: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = z.object({ ropingId: z.uuid(), limit: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Enter a whole-number limit, or leave it blank for unlimited." };
  const context = await eventStaffAccess(eventId, "can_manage_event");
  if (!context) return { message: "Event manager access is required." };
  const roping = await context.supabase.from("event_ropings").select("id").eq("id", parsed.data.ropingId).eq("event_id", eventId).maybeSingle();
  if (roping.error || !roping.data) return { message: "Choose a roping from this event." };
  const { error } = await context.supabase.rpc("set_roping_entry_limit", { target_roping: parsed.data.ropingId, new_limit: parsed.data.limit === "" ? null : parsed.data.limit });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}/entries`);
  return { success: true, message: "Entry limit saved." };
}

export async function resolveWaitlist(eventId: string, _: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = z.object({ id: z.uuid(), revision: z.coerce.number().int().positive(), decision: z.enum(["offer", "accept", "decline", "cancel"]), note: z.string().trim().max(500) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Choose a valid waitlist action." };
  const producer = await getActiveProducer();
  if (!producer) return { message: "Sign in to your producer account." };
  const db = await createClient();
  const row = await db.from("roping_waitlist").select("id,event_roping_id").eq("id", parsed.data.id).eq("event_id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (row.error || !row.data) return { message: "This waitlist entry is unavailable." };
  if (parsed.data.decision === "accept") {
    const error = await refreshEventQualificationChecks(eventId, row.data.event_roping_id);
    if (error) return { message: error };
  }
  const { error } = await db.rpc("resolve_roping_waitlist", { target_waitlist: parsed.data.id, expected_revision: parsed.data.revision, decision: parsed.data.decision, staff_note: parsed.data.note });
  if (error) return { message: error.message };
  for (const path of ["", "/entries", "/live", "/payouts"]) revalidatePath(`/events/${eventId}${path}`);
  revalidatePath("/roper");
  return { success: true, message: parsed.data.decision === "accept" ? "Entry accepted. Fees are now due." : "Waitlist updated." };
}
