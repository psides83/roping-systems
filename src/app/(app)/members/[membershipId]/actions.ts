"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getMemberProfileSections,
  type CustomMembershipSection,
  type MemberProfileField,
  type SelectedMembershipField,
} from "@/lib/membership-forms";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneNumber, formatProperNoun } from "@/lib/utils";

export interface MemberClassificationFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface MemberProfileFormState {
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

const profileSchema = z.object({
  membershipId: z.uuid(),
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .transform(formatProperNoun),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .transform(formatProperNoun),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  phone: z.string().trim(),
  birthDate: z.union([z.literal(""), z.iso.date()]),
  competitionGender: z.enum(["female", "male"]),
  memberNumber: z.string().trim().min(1, "Member number is required."),
  status: z.enum(["active", "pending", "expired", "inactive"]),
  joinedOn: z.union([z.literal(""), z.iso.date()]),
  expiresOn: z.union([z.literal(""), z.iso.date()]),
  notes: z.string().trim(),
  classificationEffectiveOn: z.iso.date(),
  classificationReason: z.string().trim(),
  classificationChanges: z.string(),
});

const classificationChangesSchema = z.array(
  z.object({
    disciplineId: z.uuid(),
    classificationId: z.union([z.literal(""), z.uuid()]),
  }),
);

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return null;
  return { producer, supabase: await createClient() };
}

const properNounProfileFields = new Set(["city", "state", "completer_name"]);

function cleanProfileFieldValue(
  field: MemberProfileField,
  value: FormDataEntryValue | undefined,
) {
  if (field.type === "checkbox") return value === "true";
  const text = typeof value === "string" ? value.trim() : "";
  if (field.type === "phone") return formatPhoneNumber(text);
  if (properNounProfileFields.has(field.key)) return formatProperNoun(text);
  return text;
}

async function parseMemberProfileFields(
  context: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  formData: FormData,
) {
  const { data: form, error } = await context.supabase
    .from("membership_forms")
    .select("standard_fields, custom_sections")
    .eq("producer_id", context.producer.id)
    .maybeSingle();
  if (error) return { message: error.message };
  if (!form) return { values: {} as Record<string, string | boolean> };

  const sections = getMemberProfileSections(
    form.standard_fields as unknown as SelectedMembershipField[],
    form.custom_sections as unknown as CustomMembershipSection[],
  );
  const values: Record<string, string | boolean> = {};
  const errors: Record<string, string[]> = {};

  for (const field of sections.flatMap((section) => section.fields)) {
    const inputName = `profileField:${field.key}`;
    const entries = formData.getAll(inputName);
    const value = cleanProfileFieldValue(field, entries.at(-1));
    if (field.required && (value === "" || value === false))
      errors[inputName] = [`${field.label} is required.`];
    if (
      field.type === "email" &&
      typeof value === "string" &&
      value &&
      !z.email().safeParse(value).success
    )
      errors[inputName] = ["Enter a valid email address."];
    if (
      field.type === "date" &&
      typeof value === "string" &&
      value &&
      !z.iso.date().safeParse(value).success
    )
      errors[inputName] = ["Enter a valid date."];
    if (
      field.type === "select" &&
      typeof value === "string" &&
      value &&
      !field.options.includes(value)
    )
      errors[inputName] = ["Choose an available option."];
    values[field.key] = value;
  }

  return Object.keys(errors).length ? { errors } : { values };
}

export async function updateMember(
  _state: MemberProfileFormState,
  formData: FormData,
): Promise<MemberProfileFormState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  let classificationChanges: z.infer<typeof classificationChangesSchema>;
  try {
    classificationChanges = classificationChangesSchema.parse(
      JSON.parse(parsed.data.classificationChanges),
    );
  } catch {
    return { message: "Check the member's classification selections." };
  }
  const context = await getManagerContext();
  if (!context)
    return { message: "Manager access is required to edit members." };
  const profileFields = await parseMemberProfileFields(context, formData);
  if ("message" in profileFields) return { message: profileFields.message };
  if ("errors" in profileFields) return { errors: profileFields.errors };

  const { error } = await context.supabase.rpc(
    "update_organization_member_with_finals",
    {
      target_organization_id: context.producer.id,
      target_membership_id: parsed.data.membershipId,
      member_first_name: parsed.data.firstName,
      member_last_name: parsed.data.lastName,
      member_email: parsed.data.email,
      member_phone: parsed.data.phone,
      member_birth_date: parsed.data.birthDate || null,
      member_competition_gender: parsed.data.competitionGender,
      new_member_number: parsed.data.memberNumber,
      new_status: parsed.data.status,
      new_joined_on: parsed.data.joinedOn || null,
      new_expires_on: parsed.data.expiresOn || null,
      new_notes: parsed.data.notes,
      classification_changes: classificationChanges,
      classification_effective_on: parsed.data.classificationEffectiveOn,
      classification_change_reason: parsed.data.classificationReason,
      member_profile_fields: profileFields.values,
      finals_decision: ["transfer", "revoke"].includes(String(formData.get("finalsDecision"))) ? String(formData.get("finalsDecision")) : null,
    },
  );
  if (error)
    return {
      message:
        error.code === "23505"
          ? "That member number or email address is already in use."
          : error.message,
    };

  revalidatePath(`/members/${parsed.data.membershipId}`);
  revalidatePath("/members");
  revalidatePath("/settings/classifications");
  return { success: true, message: "Member updated." };
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

  const { error } = await context.supabase.rpc("set_member_classification_with_finals", {
    target_organization_id: context.producer.id,
    target_membership_id: parsed.data.membershipId,
    target_classification_id: parsed.data.classificationId,
    new_effective_on: parsed.data.effectiveOn,
    change_reason: parsed.data.reason,
    source_review_id: parsed.data.reviewId || null,
    finals_decision: ["transfer", "revoke"].includes(String(formData.get("finalsDecision"))) ? String(formData.get("finalsDecision")) : null,
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
    .from("membership_classification_reviews")
    .update({
      status: "dismissed",
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.reviewId)
    .eq("membership_id", parsed.data.membershipId)
    .eq("producer_id", context.producer.id)
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
    target_organization_id: context.producer.id,
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
      target_organization_id: context.producer.id,
      target_membership_id: parsed.data.membershipId,
      new_competition_gender: parsed.data.competitionGender,
    },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/members/${parsed.data.membershipId}`);
}
