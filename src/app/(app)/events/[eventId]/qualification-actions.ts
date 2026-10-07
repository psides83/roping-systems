"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { buildQualificationCheck } from "@/lib/events/qualification-checks";

export async function loadRopingQualification(ropingId: string) {
  const producer = await getActiveProducer();
  if (!producer || (producer.role === "viewer" && !producer.eventManager) || !z.uuid().safeParse(ropingId).success) throw new Error("Manager access is required.");
  const db = await createClient();
  const roping = await db.from("event_ropings").select("classification_id,division_id,competition_format")
    .eq("id", ropingId).eq("producer_id", producer.id).single();
  if (roping.error) throw new Error("Roping not found.");
  const classKey = ["handicap", "four_d"].includes(roping.data.competition_format)
    ? `${roping.data.division_id}:${roping.data.competition_format}` : roping.data.classification_id;
  const rules = await db.from("standings_qualification_rules").select("season_id,top_places,minimum_ropings,cutoff_on,earned_position_policy")
    .eq("producer_id", producer.id).eq("class_key", classKey ?? "");
  const seasons = await db.from("producer_seasons").select("id,name").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const current = await db.from("roping_qualification_checks").select("season_id,checked_at")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).maybeSingle();
  if (rules.error || seasons.error || current.error) throw new Error("Unable to load qualification setup.");
  return { seasons: seasons.data.filter((season) => rules.data.some((rule) => rule.season_id === season.id)),
    rules: rules.data, current: current.data };
}

export async function saveRopingQualification(ropingId: string, seasonId: string): Promise<{ error?: string; success?: boolean }> {
  try {
    const producer = await getActiveProducer();
    if (!producer || (producer.role === "viewer" && !producer.eventManager) || !z.uuid().safeParse(ropingId).success) return { error: "Manager access is required." };
    const db = await createClient();
    const roping = await db.from("event_ropings").select("event_id,classification_id,division_id,competition_format")
      .eq("id", ropingId).eq("producer_id", producer.id).single();
    if (roping.error) return { error: "Roping not found." };
    if (!seasonId) {
      const result = await db.rpc("save_roping_qualification_check", {
        target_roping_id: ropingId, target_season_id: null, target_class_key: null,
        expected_revision: 0, target_standings: [], target_rule_updated_at: null,
      });
      if (result.error) return { error: result.error.message };
    } else {
      if (!z.uuid().safeParse(seasonId).success) return { error: "Choose a season." };
      const classKey = ["handicap", "four_d"].includes(roping.data.competition_format)
        ? `${roping.data.division_id}:${roping.data.competition_format}` : roping.data.classification_id;
      if (!classKey) return { error: "This roping needs a classification." };
      await buildQualificationCheck(ropingId, seasonId, classKey);
    }
    revalidatePath(`/events/${roping.data.event_id}`);
    revalidatePath(`/events/${roping.data.event_id}/entries`);
    revalidatePath("/public", "layout");
    return { success: true };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to save qualification." }; }
}
