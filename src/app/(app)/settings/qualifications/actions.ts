"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  season_id: z.uuid(),
  top_places: z.number().int().positive().nullable(),
  minimum_ropings: z.number().int().min(0).max(10000),
  cutoff_on: z.iso.date().nullable(),
  requirement_match: z.enum(["all", "any"]),
  earned_position_policy: z.enum(["none", "rank", "rank_and_attendance"]),
  bonus_entries_enabled: z.boolean(),
});

export async function saveQualificationRuleSet(id: string | null, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Producer administrator access is required." };
  if (id && !z.uuid().safeParse(id).success) return { error: "Invalid rule set." };
  const parsed = schema.safeParse({
    name: form.get("name"), season_id: form.get("season_id"),
    top_places: form.get("top_places") ? Number(form.get("top_places")) : null,
    minimum_ropings: Number(form.get("minimum_ropings") ?? 0), cutoff_on: form.get("cutoff_on") || null,
    requirement_match: form.get("requirement_match"), earned_position_policy: form.get("earned_position_policy"),
    bonus_entries_enabled: form.get("bonus_entries_enabled") === "on",
  });
  if (!parsed.success) return { error: "Check the rule name, season, and qualification requirements." };
  const db = await createClient();
  const result = id
    ? await db.from("qualification_rule_sets").update(parsed.data).eq("id", id).eq("producer_id", producer.id).select("id").single()
    : await db.from("qualification_rule_sets").insert({ ...parsed.data, producer_id: producer.id });
  if (result.error) return { error: result.error.message };
  revalidatePath("/settings/qualifications");
  revalidatePath("/events", "layout");
  revalidatePath("/public", "layout");
  return { success: true };
}

export async function deleteQualificationRuleSet(id: string) {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role) || !z.uuid().safeParse(id).success) return { error: "Producer administrator access is required." };
  const db = await createClient();
  const result = await db.from("qualification_rule_sets").delete().eq("id", id).eq("producer_id", producer.id);
  if (result.error) return { error: result.error.code === "23503" ? "This rule set is in use. Remove its event and roping assignments before deleting it." : result.error.message };
  revalidatePath("/settings/qualifications");
  return { success: true };
}
