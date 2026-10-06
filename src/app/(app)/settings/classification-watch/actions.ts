"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

type State = { error?: string; success?: boolean };

export async function updateStandingsCarryover(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "An owner or administrator must change this setting." };
  const db = await createClient();
  const { error } = await db.from("producers").update({ standings_cap_carryover: form.get("cap") === "on" })
    .eq("id", producer.id).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/settings/classification-watch");
  revalidatePath("/public", "layout");
  return { success: true };
}
const ruleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  classificationId: z.uuid(),
  threshold: z.coerce.number().positive().max(999999).multipleOf(0.01),
  reviewCount: z.coerce.number().int().min(1).max(100),
  timeBasis: z.enum(["raw", "final"]),
  proposedId: z.union([z.uuid(), z.literal("")]),
});

function refresh() {
  revalidatePath("/settings/classification-watch");
  revalidatePath("/events", "layout");
  revalidatePath("/members", "layout");
}

export async function addWatchStarter(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const divisionId = z.uuid().safeParse(form.get("divisionId"));
  if (!divisionId.success) return { error: "Select a division." };
  const db = await createClient();
  const division = await db.from("divisions").select("id").eq("id", divisionId.data).eq("producer_id", producer.id).single();
  if (division.error) return { error: "Division not found." };
  const { error } = await db.rpc("add_ucr_watch_starter", { target_division_id: divisionId.data });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function saveWatchRule(_: State, form: FormData): Promise<State> {
  const parsed = ruleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Complete the rule with a valid classification, time, and review count." };
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const db = await createClient();
  const classification = await db.from("classifications").select("division_id").eq("producer_id", producer.id).eq("id", parsed.data.classificationId).single();
  if (classification.error) return { error: "Choose a classification belonging to this producer." };
  const id = String(form.get("id") ?? "");
  if (id && !z.uuid().safeParse(id).success) return { error: "Invalid rule." };
  const row = {
    producer_id: producer.id,
    division_id: classification.data.division_id,
    classification_id: parsed.data.classificationId,
    name: parsed.data.name,
    threshold_seconds: parsed.data.threshold,
    inclusive: form.get("inclusive") === "on",
    time_basis: parsed.data.timeBasis,
    review_count: parsed.data.reviewCount,
    proposed_classification_id: parsed.data.proposedId || null,
    is_active: form.get("active") === "on",
  };
  const result = id
    ? await db.from("classification_watch_rules").update(row).eq("producer_id", producer.id).eq("id", id).select("id").single()
    : await db.from("classification_watch_rules").insert(row);
  if (result.error) return { error: result.error.message };
  refresh();
  return { success: true };
}

export async function updateWatchSettings(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "An owner or administrator must change this setting." };
  const db = await createClient();
  const { error } = await db.from("producers").update({ classification_watch_enabled: form.get("enabled") === "on" }).eq("id", producer.id).select("id").single();
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function deleteWatchRule(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Invalid rule." };
  const db = await createClient();
  const { error } = await db.from("classification_watch_rules").delete().eq("producer_id", producer.id).eq("id", id.data);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function acknowledgeWatch(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const parsed = z.object({ membershipId: z.uuid(), divisionId: z.uuid(), reason: z.string().trim().min(5).max(2000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Explain the staff decision (at least five characters)." };
  const db = await createClient();
  const member = await db.from("memberships").select("id").eq("id", parsed.data.membershipId).eq("producer_id", producer.id).single();
  if (member.error) return { error: "Member not found." };
  const { error } = await db.rpc("acknowledge_classification_watch", { target_membership_id: parsed.data.membershipId, target_division_id: parsed.data.divisionId, target_reason: parsed.data.reason });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}
