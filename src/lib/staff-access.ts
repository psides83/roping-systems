import "server-only";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export type EventPermission = "can_manage_event" | "can_finance_event" | "can_collect_event" | "can_adjust_event_finances";

export async function eventStaffAccess(eventId: string, permission: EventPermission) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const supabase = await createClient();
  const event = await supabase.from("events").select("id").eq("id", eventId).eq("producer_id", producer.id).maybeSingle();
  const access = await supabase.rpc(permission, { target_event: eventId });
  if (event.error || !event.data || access.error || !access.data) return null;
  return { producer, supabase };
}
