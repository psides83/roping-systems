import { createClient } from "@/lib/supabase/server";
import { emptyEventInformation } from "@/lib/events/event-information";
import { EventInformationDialog } from "./event-information-dialog";

export async function EventInformationEditor({ eventId }: { eventId: string }) {
  const db = await createClient();
  const { data, error } = await db.from("event_information").select("flyer_url,directions,venue_information,contact_name,contact_phone,contact_email,entry_information").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Unable to load event information.");
  return <EventInformationDialog eventId={eventId} information={data ?? emptyEventInformation} />;
}
