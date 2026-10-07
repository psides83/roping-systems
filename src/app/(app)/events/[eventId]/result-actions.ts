"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { eventStaffAccess } from "@/lib/staff-access";
import { createClient } from "@/lib/supabase/server";

export interface OfficialResultState { success?: boolean; message?: string }

export async function markEventResultsOfficial(eventId: string, _state: OfficialResultState): Promise<OfficialResultState> {
  void _state;
  if (!z.uuid().safeParse(eventId).success) return { message: "Choose a valid event." };
  const producer = await getActiveProducer();
  if (!producer || !await eventStaffAccess(eventId, "can_manage_event")) return { message: "Management access for this event is required." };
  const supabase = await createClient();
  const { data: event, error: lookupError } = await supabase.from("events").select("id, status")
    .eq("id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (lookupError) return { message: lookupError.message };
  if (!event || !["in_progress", "completed"].includes(event.status)) return { message: "Results can be marked official after competition has started." };
  const { error } = await supabase.rpc("finalize_roping_results", { target_roping_id: event.id });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/live`);
  revalidatePath("/events");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: "Event completed and results marked official." };
}
