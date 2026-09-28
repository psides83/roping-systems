"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface MemberClassificationFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const assignmentSchema = z.object({
  membershipId: z.uuid(),
  classificationId: z.uuid(),
  effectiveOn: z.iso.date(),
  reason: z.string().trim(),
  reviewId: z.union([z.literal(""), z.uuid()]).optional(),
});

const watchSchema = z.object({
  membershipId: z.uuid(),
  disciplineId: z.uuid(),
  occurredOn: z.iso.date(),
  reason: z.string().trim().min(1, "Select or enter a reason."),
  notes: z.string().trim(),
});

const reviewSchema = z.object({
  membershipId: z.uuid(),
  reviewId: z.uuid(),
});

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function assignMemberClassification(_state: MemberClassificationFormState, formData: FormData): Promise<MemberClassificationFormState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Manager access is required to change classifications." };

  const { error } = await context.supabase.rpc("set_member_classification", {
    target_organization_id: context.organization.id,
    target_membership_id: parsed.data.membershipId,
    target_classification_id: parsed.data.classificationId,
    new_effective_on: parsed.data.effectiveOn,
    change_reason: parsed.data.reason,
    source_review_id: parsed.data.reviewId || null,
  });
  if (error) return { message: error.message };

  revalidatePath(`/members/${parsed.data.membershipId}`);
  revalidatePath("/members");
  revalidatePath("/settings/classifications");
  return { success: true, message: "Classification updated." };
}

export async function recordWatchEvent(_state: MemberClassificationFormState, formData: FormData): Promise<MemberClassificationFormState> {
  const parsed = watchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Manager access is required to record watch events." };

  const [{ data: membership }, { data: discipline }] = await Promise.all([
    context.supabase.from("organization_memberships").select("id").eq("id", parsed.data.membershipId).eq("organization_id", context.organization.id).single(),
    context.supabase.from("disciplines").select("id, watch_threshold").eq("id", parsed.data.disciplineId).eq("organization_id", context.organization.id).single(),
  ]);
  if (!membership || !discipline) return { message: "The member or division is not available in this organization." };

  const { error } = await context.supabase.from("classification_watch_events").insert({
    organization_id: context.organization.id,
    membership_id: membership.id,
    discipline_id: discipline.id,
    occurred_on: parsed.data.occurredOn,
    reason: parsed.data.reason,
    notes: parsed.data.notes || null,
    recorded_by: (await context.supabase.auth.getClaims()).data?.claims?.sub ?? null,
  });
  if (error) return { message: error.message };

  let reviewOpened = false;
  if (discipline.watch_threshold) {
    const [{ count }, { data: current }] = await Promise.all([
      context.supabase.from("classification_watch_events").select("id", { count: "exact", head: true }).eq("membership_id", membership.id).eq("discipline_id", discipline.id).eq("is_active", true),
      context.supabase.from("member_classifications").select("classification_id").eq("membership_id", membership.id).eq("discipline_id", discipline.id).is("ended_on", null).maybeSingle(),
    ]);
    if ((count ?? 0) >= discipline.watch_threshold) {
      const { error: reviewError } = await context.supabase.from("classification_reviews").insert({
        organization_id: context.organization.id,
        membership_id: membership.id,
        discipline_id: discipline.id,
        current_classification_id: current?.classification_id ?? null,
        reason: `Reached ${discipline.watch_threshold} active watch events`,
        created_by: (await context.supabase.auth.getClaims()).data?.claims?.sub ?? null,
      });
      reviewOpened = !reviewError;
      if (reviewError && reviewError.code !== "23505") return { message: `Watch event saved, but the review could not be opened: ${reviewError.message}` };
    }
  }

  revalidatePath(`/members/${parsed.data.membershipId}`);
  revalidatePath("/settings/classifications");
  return { success: true, message: reviewOpened ? "Watch event recorded and a classification review was opened." : "Watch event recorded." };
}

export async function dismissClassificationReview(formData: FormData) {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const context = await getManagerContext();
  if (!context) return;
  const userId = (await context.supabase.auth.getClaims()).data?.claims?.sub ?? null;
  await context.supabase.from("classification_reviews").update({ status: "dismissed", resolved_by: userId, resolved_at: new Date().toISOString() }).eq("id", parsed.data.reviewId).eq("membership_id", parsed.data.membershipId).eq("organization_id", context.organization.id).eq("status", "open");
  revalidatePath(`/members/${parsed.data.membershipId}`);
  revalidatePath("/settings/classifications");
}
