"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
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
  if (!producer || producer.role === "viewer") return { message: "Manager access is required." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events")
    .update({ publication_state: parsed.data.publicationState, is_public: parsed.data.publicationState === "published" })
    .eq("id", parsed.data.eventId).eq("producer_id", producer.id).select("id").maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "Event not found or you do not have permission to update it." };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: parsed.data.publicationState === "published" ? "Event and results published." : "Event hidden from the public page." };
}
