import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { QualificationNotice } from "./qualification-notice";
import { readAllRows } from "@/lib/supabase/read-all-rows";

export async function loadPublicQualificationNotices(producerSlug: string, eventId?: string) {
  const db = await createClient();
  const notices = await readAllRows<QualificationNotice>((first, last) => db.rpc("public_roping_qualification_notices", {
    target_producer_slug: producerSlug, target_event_id: eventId ?? null,
  }).order("event_roping_id").range(first, last), "Unable to load roping qualification requirements");
  return new Map(notices.map((notice) => [notice.event_roping_id, notice]));
}
