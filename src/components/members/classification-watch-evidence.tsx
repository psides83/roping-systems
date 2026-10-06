import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import type { RunFlag } from "@/lib/classification-watch";
import { ClassificationWatchList } from "./classification-watch-list";

export async function ClassificationWatchEvidence({ membershipId, eventId, compact = false }: { membershipId?: string; eventId?: string; compact?: boolean }) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const db = await createClient();
  const flags: RunFlag[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("classification_run_flags")
      .select("*, memberships!inner(ropers!inner(first_name,last_name)), event_ropings!inner(name)")
      .eq("producer_id", producer.id).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (membershipId) query = query.eq("membership_id", membershipId);
    if (compact) query = query.eq("is_active", true).is("reviewed_at", null);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load classification watch: ${error.message}`);
    flags.push(...(data ?? []) as unknown as RunFlag[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  const classes = await db.from("classifications").select("id,name").eq("producer_id", producer.id);
  if (classes.error) throw new Error("Unable to load watch classification names.");
  return <ClassificationWatchList flags={flags} canEdit={producer.role !== "viewer"} compact={compact} eventId={eventId} classificationNames={Object.fromEntries(classes.data.map((c) => [c.id,c.name]))} />;
}
