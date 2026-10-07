"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { eventStaffAccess } from "@/lib/staff-access";
import { createClient } from "@/lib/supabase/server";

export interface PublicationState {
  success?: boolean;
  message?: string;
}

export async function updateEventPublication(eventId: string, _state: PublicationState, formData: FormData): Promise<PublicationState> {
  const parsed = z.object({
    eventId: z.uuid(),
    publicationState: z.enum(["draft", "published", "unpublished"]),
  }).safeParse({ eventId, publicationState: formData.get("publicationState") });
  if (!parsed.success) return { message: "Choose a valid publication state." };
  const producer = await getActiveProducer();
  if (!producer || !await eventStaffAccess(eventId, "can_manage_event")) return { message: "Management access for this event is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_publication", { target_event: eventId, target_state: parsed.data.publicationState });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: parsed.data.publicationState === "published" ? "Event and results published." : "Event hidden from the public page." };
}
