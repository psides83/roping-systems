import { getActiveProducer } from "@/lib/producers";
import { getProducerFeatures } from "@/lib/producer-features-server";
import { featureEnabled } from "@/lib/producer-features";
import { createClient } from "@/lib/supabase/server";
import type { RunFlag, WatchCurrentAssignment } from "@/lib/classification-watch";
import { seasonCalendarDate } from "@/lib/seasons";
import { ClassificationWatchList } from "./classification-watch-list";

export async function ClassificationWatchEvidence({ membershipId, eventId, compact = false }: { membershipId?: string; eventId?: string; compact?: boolean }) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const db = await createClient();
  const flags: RunFlag[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db.from("classification_run_flags")
      .select("*, memberships!inner(ropers!inner(first_name,last_name)), event_ropings!inner(name), review:membership_classification_reviews!classification_run_flags_review_fk(id,current_classification_id,proposed_classification_id,review_on,decision_staff_label)")
      .eq("producer_id", producer.id).order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (membershipId) query = query.eq("membership_id", membershipId);
    if (compact) query = query.eq("is_active", true).is("reviewed_at", null);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load classification watch: ${error.message}`);
    flags.push(...(data ?? []) as unknown as RunFlag[]);
    if ((data?.length ?? 0) < 1000) break;
  }
  if (!flags.length && !featureEnabled(await getProducerFeatures(producer.id), "watch")) return null;
  const classes = await db.from("classifications").select("id,name,division_id,is_active").eq("producer_id", producer.id).order("rank", { ascending: false });
  if (classes.error) throw new Error("Unable to load watch classification names.");
  const assignments: WatchCurrentAssignment[] = [];
  if (flags.some((flag) => flag.is_active && !flag.reviewed_at)) {
    for (let offset = 0; ; offset += 1000) {
      let query = db.from("membership_classification_history")
        .select("id,membership_id,division_id,classification_id,effective_on")
        .eq("producer_id", producer.id).is("ended_on", null).order("id").range(offset, offset + 999);
      if (membershipId) query = query.eq("membership_id", membershipId);
      const { data, error } = await query;
      if (error) throw new Error("Unable to load current member classifications.");
      assignments.push(...data);
      if (data.length < 1000) break;
    }
  }
  return <ClassificationWatchList flags={flags} canEdit={producer.role !== "viewer"} compact={compact} eventId={eventId}
    classificationNames={Object.fromEntries(classes.data.map((c) => [c.id,c.name]))} classifications={classes.data} assignments={assignments}
    today={seasonCalendarDate(new Date().toISOString(), producer.timezone)!} />;
}
