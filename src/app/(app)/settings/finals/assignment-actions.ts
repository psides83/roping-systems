"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";

export interface FinalsAssignmentState { error?: string; success?: boolean }
export async function assignFinalsPosition(_state: FinalsAssignmentState, form: FormData): Promise<FinalsAssignmentState> {
  void _state;
  const parsed = z.object({ seasonId: z.uuid(), awardId: z.string().min(1).max(150), number: z.coerce.number().int().min(1).max(1000),
    targetId: z.union([z.uuid(), z.literal("")]), reason: z.string().trim().min(5).max(2000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Select a target and provide a reason of at least five characters." };
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Producer management access is required." };
  try {
    const db = await createClient();
    const revision = await db.from("producers").select("standings_revision").eq("id", producer.id).single();
    if (revision.error) throw new Error("Unable to load current finals positions.");
    const finals = await loadFinalsQualifications(producer.slug, parsed.data.seasonId);
    const award = finals.awards.find((item) => item.id === parsed.data.awardId && !item.revoked && item.producerId === producer.id && item.seasonId === parsed.data.seasonId);
    if (!award || parsed.data.number > award.positions) return { error: "This position is no longer earned. Refresh before assigning it." };
    const result = await db.rpc("assign_finals_position", { target_producer_id: producer.id, target_season_id: parsed.data.seasonId,
      target_membership_id: award.memberId, target_award_key: award.id, target_position_number: parsed.data.number,
      target_class_key: award.classId, target_roping_id: parsed.data.targetId || null, expected_revision: revision.data.standings_revision,
      assignment_reason: parsed.data.reason });
    if (result.error) return { error: result.error.message };
    revalidatePath("/settings/finals"); revalidatePath("/events", "layout"); revalidatePath("/members", "layout"); revalidatePath("/public", "layout");
    return { success: true };
  } catch (error) { return { error: error instanceof Error ? error.message : "Unable to assign this bonus position." }; }
}
