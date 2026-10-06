"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

const approvalSchema = z.object({
  membershipId: z.uuid(),
  divisionId: z.uuid(),
  assignmentId: z.uuid(),
  classificationId: z.uuid(),
  effectiveOn: z.iso.date(),
  reason: z.string().trim().min(5).max(2000),
  reference: z.uuid(),
  flagIds: z.array(z.uuid()).min(1).max(1000),
});

export async function approveWatchMove(form: FormData): Promise<{ error?: string }> {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "Staff permission is required." };
  const parsed = approvalSchema.safeParse({ ...Object.fromEntries(form), flagIds: form.getAll("flagId") });
  if (!parsed.success) return { error: "Choose a classification, effective date, and reason (at least five characters)." };
  const db = await createClient();
  const { error } = await db.rpc("approve_classification_watch", {
    target_producer_id: producer.id,
    target_membership_id: parsed.data.membershipId,
    target_division_id: parsed.data.divisionId,
    expected_assignment_id: parsed.data.assignmentId,
    target_classification_id: parsed.data.classificationId,
    new_effective_on: parsed.data.effectiveOn,
    change_reason: parsed.data.reason,
    source_flag_ids: parsed.data.flagIds,
    target_review_id: parsed.data.reference,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings/classification-watch");
  revalidatePath("/settings/classifications");
  revalidatePath("/members", "layout");
  revalidatePath("/events", "layout");
  return {};
}
