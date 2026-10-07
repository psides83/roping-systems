"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { validateFinalsQualificationRule, type FinalsQualificationRule } from "@/lib/finals-qualifications";

async function context(ropingId: string) {
  const producer = await getActiveProducer();
  if (!producer || !z.uuid().safeParse(ropingId).success) throw new Error("Choose a roping.");
  const db = await createClient();
  const access = await db.rpc("can_manage_event_roping", { target_roping: ropingId });
  if (access.error || !access.data) throw new Error("Management access for this roping is required.");
  const roping = await db.from("event_ropings").select("event_id,classification_id,division_id,competition_format,main_round_count,short_round_enabled,scheduled_date")
    .eq("id", ropingId).eq("producer_id", producer.id).single();
  if (roping.error) throw new Error("Roping not found.");
  return { producer, db, roping: roping.data };
}

export async function loadFinalsQualifierSetup(ropingId: string) {
  const { producer, db, roping } = await context(ropingId);
  const seasons = await db.from("producer_seasons").select("id,name").eq("producer_id", producer.id)
    .lte("starts_on", roping.scheduled_date).gte("ends_on", roping.scheduled_date).order("starts_on", { ascending: false });
  const rules = await db.from("finals_qualification_rules").select("id,season_id,stage,round_number,places,repeat_policy,tie_policy,maximum_positions,enabled")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).order("round_number");
  if (seasons.error || rules.error) throw new Error("Unable to load finals qualifier setup.");
  return { seasons: seasons.data, rules: rules.data, rounds: roping.main_round_count, shortRound: roping.short_round_enabled };
}

export async function saveFinalsQualifier(ropingId: string, input: {
  id?: string; seasonId: string; stage: FinalsQualificationRule["stage"]; round: number | null;
  places: FinalsQualificationRule["places"]; repeatPolicy: FinalsQualificationRule["repeatPolicy"];
  tiePolicy: FinalsQualificationRule["tiePolicy"]; maximumPositions: number | null; enabled: boolean;
}): Promise<{ error?: string }> {
  try {
    const { producer, db, roping } = await context(ropingId);
    if (!z.uuid().safeParse(input.seasonId).success || (input.id && !z.uuid().safeParse(input.id).success) || !Array.isArray(input.places) || typeof input.enabled !== "boolean") return { error: "Choose a season and valid award settings." };
    const classId = ["handicap", "four_d"].includes(roping.competition_format) ? `${roping.division_id}:${roping.competition_format}` : roping.classification_id;
    const errors = validateFinalsQualificationRule({ ...input, id: input.id ?? "new", producerId: producer.id, ropingId, classId: classId ?? "" });
    if (errors.length) return { error: errors.join(" ") };
    const values = { producer_id: producer.id, event_roping_id: ropingId, season_id: input.seasonId, stage: input.stage,
      round_number: input.round ?? 0, places: input.places, repeat_policy: input.repeatPolicy, tie_policy: input.tiePolicy,
      maximum_positions: input.maximumPositions, enabled: input.enabled };
    const result = input.id ? await db.from("finals_qualification_rules").update(values).eq("id", input.id).eq("producer_id", producer.id).eq("event_roping_id", ropingId).select("id").single()
      : await db.from("finals_qualification_rules").insert(values).select("id").single();
    if (result.error) return { error: result.error.code === "23505" ? "This stage already has a qualifier rule. Edit its existing rule." : result.error.message };
    revalidatePath(`/events/${roping.event_id}`);
    revalidatePath("/settings/finals"); revalidatePath("/members", "layout"); revalidatePath("/public", "layout");
    return {};
  } catch (e) { return { error: e instanceof Error ? e.message : "Unable to save qualifier rules." }; }
}

export async function removeFinalsQualifier(ropingId: string, ruleId: string): Promise<{ error?: string }> {
  try {
    const { producer, db, roping } = await context(ropingId);
    if (!z.uuid().safeParse(ruleId).success) return { error: "Choose a qualifier rule." };
    const result = await db.from("finals_qualification_rules").delete().eq("id", ruleId).eq("producer_id", producer.id).eq("event_roping_id", ropingId).select("id").single();
    if (result.error) return { error: "Unable to remove this qualifier rule." };
    revalidatePath(`/events/${roping.event_id}`); revalidatePath("/settings/finals"); revalidatePath("/members", "layout"); revalidatePath("/public", "layout");
    return {};
  } catch (e) { return { error: e instanceof Error ? e.message : "Unable to remove qualifier rules." }; }
}
