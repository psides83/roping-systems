import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { FeeCollection } from "./fee-collections";

export const getEventFeeCollections = cache(async (eventId: string): Promise<FeeCollection[]> => {
  const db = await createClient();
  const { data, error } = await db.rpc("event_fee_collection_summary", { target_event_id: eventId });
  if (error) throw new Error("Unable to load fee collections.");
  return (data ?? []) as FeeCollection[];
});
