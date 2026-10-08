"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export async function saveQualificationRule(_: { error?: string; success?: boolean }, form: FormData): Promise<{ error?: string; success?: boolean }> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Administrator permission is required." };
  const parsed = z.object({ season: z.uuid(), class: z.string().min(1).max(80),
    topPlaces: z.union([z.literal(""), z.coerce.number().int().min(1).max(10000)]),
    minimumRopings: z.coerce.number().int().min(0).max(10000),
    cutoff: z.union([z.literal(""), z.iso.date()]),
    attendanceCutoff: z.union([z.literal(""), z.iso.date()]),
    earnedPositionPolicy: z.enum(["none", "rank", "rank_and_attendance"]),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter valid places, attendance, and cutoff dates." };
  const db = await createClient();
  const enabled = form.get("enabled") === "on";
  const result = enabled ? await db.from("standings_qualification_rules").upsert({
    producer_id: producer.id, season_id: parsed.data.season, class_key: parsed.data.class,
    top_places: parsed.data.topPlaces || null, minimum_ropings: parsed.data.minimumRopings,
    cutoff_on: parsed.data.cutoff || null,
    attendance_cutoff_on: parsed.data.attendanceCutoff || null,
    earned_position_policy: parsed.data.earnedPositionPolicy,
  }, { onConflict: "season_id,class_key" }) : await db.from("standings_qualification_rules").delete()
    .eq("producer_id", producer.id).eq("season_id", parsed.data.season).eq("class_key", parsed.data.class);
  if (result.error) return { error: result.error.message };
  revalidatePath("/settings/standings");
  revalidatePath("/public", "layout");
  return { success: true };
}
