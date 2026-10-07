"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export interface FinalsAwardState { error?: string; success?: boolean }
export async function awardManualFinalsPosition(_state: FinalsAwardState, form: FormData): Promise<FinalsAwardState> {
  void _state;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Member management access is required." };
  const parsed = z.object({ seasonId: z.uuid(), memberId: z.uuid(), classId: z.string().min(1).max(100), date: z.iso.date(), positions: z.coerce.number().int().min(1).max(1000), reason: z.string().trim().min(5).max(2000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a member, season, class, award date, position count, and a reason of at least five characters." };
  const db = await createClient();
  const result = await db.from("manual_finals_positions").insert({ producer_id: producer.id, season_id: parsed.data.seasonId, membership_id: parsed.data.memberId, class_key: parsed.data.classId, awarded_on: parsed.data.date, positions: parsed.data.positions, reason: parsed.data.reason });
  if (result.error) return { error: result.error.message };
  revalidatePath("/settings/finals"); revalidatePath("/members", "layout"); revalidatePath("/public", "layout");
  return { success: true };
}

export async function revokeManualFinalsPosition(_state: FinalsAwardState, form: FormData): Promise<FinalsAwardState> {
  void _state;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Member management access is required." };
  const parsed = z.object({ awardId: z.uuid(), reason: z.string().trim().min(5).max(2000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose an award and explain why it is being revoked." };
  const db = await createClient();
  const result = await db.from("manual_finals_positions").update({ revoked: true, revoke_reason: parsed.data.reason }).eq("id", parsed.data.awardId).eq("producer_id", producer.id).eq("revoked", false).select("id").single();
  if (result.error) return { error: "This award could not be revoked. Refresh and try again." };
  revalidatePath("/settings/finals"); revalidatePath("/members", "layout"); revalidatePath("/public", "layout");
  return { success: true };
}
