"use server";

import { revalidatePath } from "next/cache";
import { eventStaffAccess } from "@/lib/staff-access";
import { eventInformationSchema } from "@/lib/events/event-information";
import { formatProperNoun } from "@/lib/utils";

export async function saveEventInformation(eventId: string, _state: { success?: boolean; message?: string }, form: FormData): Promise<{ success?: boolean; message?: string }> {
  const parsed = eventInformationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const access = await eventStaffAccess(eventId, "can_manage_event");
  if (!access) return { message: "Event management access is required." };
  const { error } = await access.supabase.from("event_information").upsert({
    id: eventId, producer_id: access.producer.id, ...parsed.data,
    contact_name: formatProperNoun(parsed.data.contact_name), contact_email: parsed.data.contact_email.toLowerCase(),
  });
  if (error) return { message: "Unable to save event information. Please try again." };
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/public", "layout");
  return { success: true };
}
