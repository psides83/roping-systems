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

const reviewSchema = z.object({
  membershipId: z.uuid(),
  reviewId: z.uuid(),
});

const birthDateSchema = z.object({
  membershipId: z.uuid(),
  birthDate: z.union([z.literal(""), z.iso.date()]),
});

const genderSchema = z.object({
  membershipId: z.uuid(),
  competitionGender: z.enum(["female", "male"]),
});

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function assignMemberClassification(
  _state: MemberClassificationFormState,
  formData: FormData,
): Promise<MemberClassificationFormState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Manager access is required to change classifications." };

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

export async function dismissClassificationReview(formData: FormData) {
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const context = await getManagerContext();
  if (!context) return;
  const userId =
    (await context.supabase.auth.getClaims()).data?.claims?.sub ?? null;
  await context.supabase
    .from("classification_reviews")
    .update({
      status: "dismissed",
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.reviewId)
    .eq("membership_id", parsed.data.membershipId)
    .eq("organization_id", context.organization.id)
    .eq("status", "open");
  revalidatePath(`/members/${parsed.data.membershipId}`);
  revalidatePath("/settings/classifications");
}

export async function updateMemberBirthDate(formData: FormData) {
  const parsed = birthDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const context = await getManagerContext();
  if (!context) return;

  const { error } = await context.supabase.rpc("update_member_birth_date", {
    target_organization_id: context.organization.id,
    target_membership_id: parsed.data.membershipId,
    new_birth_date: parsed.data.birthDate || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${parsed.data.membershipId}`);
}

export async function updateMemberCompetitionGender(formData: FormData) {
  const parsed = genderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const context = await getManagerContext();
  if (!context) return;

  const { error } = await context.supabase.rpc(
    "update_member_competition_gender",
    {
      target_organization_id: context.organization.id,
      target_membership_id: parsed.data.membershipId,
      new_competition_gender: parsed.data.competitionGender,
    },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${parsed.data.membershipId}`);
}
