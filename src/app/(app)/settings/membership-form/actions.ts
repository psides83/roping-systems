"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun, formatPhoneNumber } from "@/lib/utils";
import { standardMembershipFields } from "@/lib/membership-forms";

export interface MembershipFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const selectedFieldSchema = z.object({
  key: z.string(),
  required: z.boolean(),
});

const customFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1),
  type: z.enum([
    "text",
    "email",
    "phone",
    "date",
    "select",
    "textarea",
    "checkbox",
  ]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1)),
});

const customSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  details: z.string().trim(),
  fields: z.array(customFieldSchema).min(1),
});

const membershipFormSchema = z.object({
  title: z.string().trim().min(2).transform(formatProperNoun),
  introduction: z.string().trim().max(4000),
  publicationState: z.enum(["draft", "published", "unpublished"]),
  releaseText: z.string().trim().max(20000),
  requireSignature: z.string().optional(),
  standardFields: z.string(),
  customSections: z.string(),
});

async function requireManager() {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return null;
  return { producer, supabase: await createClient() };
}

export async function saveMembershipForm(
  _state: MembershipFormState,
  formData: FormData,
): Promise<MembershipFormState> {
  const parsed = membershipFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  let standardFields: z.infer<typeof selectedFieldSchema>[];
  let customSections: z.infer<typeof customSectionSchema>[];
  try {
    standardFields = z
      .array(selectedFieldSchema)
      .parse(JSON.parse(parsed.data.standardFields));
    customSections = z
      .array(customSectionSchema)
      .parse(JSON.parse(parsed.data.customSections));
  } catch {
    return { message: "Check the selected fields and custom sections." };
  }

  const allowedKeys = new Set(
    standardMembershipFields.map((field) => field.key),
  );
  if (
    standardFields.some((field) => !allowedKeys.has(field.key)) ||
    new Set(standardFields.map((field) => field.key)).size !==
      standardFields.length
  )
    return { message: "One or more standard fields are invalid." };
  for (const key of ["first_name", "last_name"]) {
    const field = standardFields.find((item) => item.key === key);
    if (!field) standardFields.unshift({ key, required: true });
    else field.required = true;
  }

  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };
  const { error } = await context.supabase.from("membership_forms").upsert(
    {
      producer_id: context.producer.id,
      title: parsed.data.title,
      introduction: parsed.data.introduction || null,
      publication_state: parsed.data.publicationState,
      standard_fields: standardFields,
      custom_sections: customSections.map((section) => ({
        ...section,
        title: formatProperNoun(section.title),
      })),
      release_text: parsed.data.releaseText || null,
      require_signature: parsed.data.requireSignature === "on",
    },
    { onConflict: "producer_id" },
  );
  if (error) return { message: error.message };

  revalidatePath("/settings/membership-form");
  revalidatePath(`/public/${context.producer.slug}/membership`);
  return { success: true, message: "Membership form saved." };
}

export interface MembershipReviewState { error?: string; success?: boolean; membershipId?: string; }

export async function issueApplicationReceipt(_state: { error?: string; receiptCode?: string }, form: FormData): Promise<{ error?: string; receiptCode?: string }> {
  const id = z.uuid().safeParse(form.get("applicationId"));
  if (!id.success) return { error: "Choose a valid application." };
  const context = await requireManager();
  if (!context) return { error: "Manager access is required." };
  const { data, error } = await context.supabase.rpc("issue_membership_application_receipt", { target_application: id.data });
  if (error) return { error: error.message };
  return { receiptCode: data as string };
}

export async function reviewMembershipApplication(_state: MembershipReviewState, formData: FormData): Promise<MembershipReviewState> {
  const parsed = z
    .object({
      applicationId: z.uuid(),
      status: z.enum(["approved", "declined"]),
      reviewNote: z.string().trim().max(500),
      membershipId: z.union([z.literal(""), z.uuid()]).optional(),
      expiresOn: z.union([z.literal(""), z.iso.date()]).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the application review." };
  const context = await requireManager();
  if (!context) return { error: "Manager access is required." };
  let newMember = null;
  if (parsed.data.status === "approved" && formData.get("recordMode") === "new") {
    const details = z.object({
      firstName: z.string().trim().min(1).transform(formatProperNoun), lastName: z.string().trim().min(1).transform(formatProperNoun),
      memberNumber: z.string().trim().min(1).max(50), email: z.union([z.literal(""), z.email()]),
      phone: z.string().trim().transform(formatPhoneNumber), birthDate: z.union([z.literal(""), z.iso.date()]), gender: z.enum(["female", "male"]),
      classifications: z.array(z.uuid()),
    }).safeParse({ firstName: formData.get("firstName"), lastName: formData.get("lastName"), memberNumber: formData.get("memberNumber"),
      email: formData.get("email"), phone: formData.get("phone"), birthDate: formData.get("birthDate"), gender: formData.get("gender"),
      classifications: formData.getAll("classificationIds").map(String).filter(Boolean) });
    if (!details.success) return { error: "Check the new member's name, number, contact details, birth date, gender, and classifications." };
    newMember = details.data;
  }
  const { data, error } = await context.supabase.rpc("approve_member_application_with_record", {
    target_application: parsed.data.applicationId, decision: parsed.data.status,
    selected_membership: newMember ? null : parsed.data.membershipId || null, expires_on: parsed.data.expiresOn || null,
    staff_note: parsed.data.reviewNote, new_member: newMember,
  });
  if (error) return { error: error.code === "23505" ? "That member or member number already exists. Choose Use existing member, or assign a different member number." : error.message };
  revalidatePath("/settings/membership-form");
  revalidatePath("/members");
  revalidatePath("/roper/memberships");
  revalidatePath("/roper");
  return { success: true, membershipId: data ?? undefined };
}
