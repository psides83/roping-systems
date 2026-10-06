"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

type State = { error?: string; success?: boolean };
export async function saveMoveBackRequirement(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "An owner or administrator must change this setting." };
  const parsed = z.coerce.number().int().min(1).max(100).safeParse(form.get("minimumRopings"));
  if (!parsed.success) return { error: "Set a required roping count between 1 and 100." };
  const db = await createClient();
  const { error } = await db.from("producers").update({ classification_move_back_enabled: form.get("enabled") === "on", classification_move_back_min_ropings: parsed.data }).eq("id", producer.id).select("id").single();
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function approveMoveBackException(_: State, form: FormData): Promise<State> {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const parsed = z.object({ membershipId: z.uuid(), assignmentId: z.uuid(), reason: z.string().trim().min(5).max(2000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Explain the exception with a reason of at least five characters." };
  const db = await createClient();
  const membership = await db.from("memberships").select("id").eq("id", parsed.data.membershipId).eq("producer_id", producer.id).single();
  if (membership.error) return { error: "Member not found for this producer." };
  const { error } = await db.rpc("approve_move_back_exception", { target_membership_id: parsed.data.membershipId, expected_assignment_id: parsed.data.assignmentId, target_reason: parsed.data.reason });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

function refresh() {
  revalidatePath("/settings/classification-watch");
  revalidatePath("/settings/classifications");
  revalidatePath("/members", "layout");
  revalidatePath("/events", "layout");
}
