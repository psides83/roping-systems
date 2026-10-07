"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { finalsDecisionContext } from "@/lib/finals-qualifications";

export async function recordFinalsDecision(_state: FinalsAwardState, form: FormData): Promise<FinalsAwardState> {
  void _state;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Member management access is required." };
  const parsed = z.object({ seasonId: z.uuid(), ruleId: z.uuid(), place: z.coerce.number().int().positive(), kind: z.enum(["tie", "revoke"]), reason: z.string().trim().min(5).max(2000), entryIds: z.array(z.uuid()).min(1) })
    .safeParse({ ...Object.fromEntries(form), entryIds: form.getAll("entryIds") });
  if (!parsed.success) return { error: "Select recipients and provide a reason of at least five characters." };
  const input = parsed.data;
  try {
    const results = await loadFinalsQualifications(producer.slug, input.seasonId);
    const rule = results.rules.find((rule) => rule.id === input.ruleId);
    if (!rule) return { error: "This qualifier is no longer available." };
    const finishes = results.finishes.filter((finish) => finish.ropingId === rule.ropingId && finish.classId === rule.classId && finish.stage === rule.stage && finish.round === rule.round);
    let rank: number | null = null;
    if (input.kind === "tie") {
      const issue = results.issues.find((issue) => issue.ruleId === rule.id && issue.place === input.place && issue.reason === "tie_requires_decision");
      if (!issue || input.entryIds.some((id) => !issue.entryIds.includes(id))) return { error: "The tied results changed. Refresh before deciding." };
      rank = finishes.find((finish) => finish.entryId === issue.entryIds[0])?.place ?? null;
    } else {
      if (input.entryIds.length !== 1) return { error: "Revoke one automatic award at a time." };
      const award = results.awards.find((award) => !award.revoked && award.ruleId === rule.id && award.place === input.place && award.entryId === input.entryIds[0]);
      if (!award) return { error: "This automatic award is no longer active." };
      rank = finishes.find((finish) => finish.entryId === award.entryId)?.place ?? null;
    }
    const group = finishes.filter((finish) => finish.place === rank);
    if (rank === null || input.entryIds.some((id) => !group.some((finish) => finish.entryId === id && finish.memberId))) return { error: "Choose member entries in this placing." };
    const db = await createClient();
    const result = await db.from("finals_qualification_decisions").insert({ producer_id: producer.id, rule_id: rule.id, place: input.place, kind: input.kind, entry_ids: [...new Set(input.entryIds)], context: finalsDecisionContext(group), reason: input.reason });
    if (result.error) return { error: result.error.message };
    revalidatePath("/settings/finals"); revalidatePath("/members", "layout"); revalidatePath("/events", "layout"); revalidatePath("/public", "layout");
    return { success: true };
  } catch { return { error: "Unable to record the decision. Refresh and try again." }; }
}

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
