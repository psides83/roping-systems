"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
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
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
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
      organization_id: context.organization.id,
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
    { onConflict: "organization_id" },
  );
  if (error) return { message: error.message };

  revalidatePath("/settings/membership-form");
  revalidatePath(`/public/${context.organization.slug}/membership`);
  return { success: true, message: "Membership form saved." };
}

export async function reviewMembershipApplication(formData: FormData) {
  const parsed = z
    .object({
      applicationId: z.uuid(),
      status: z.enum(["approved", "declined"]),
      reviewNote: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Check the application review.");
  const context = await requireManager();
  if (!context) throw new Error("Manager access is required.");
  const { data: claims } = await context.supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { error } = await context.supabase
    .from("membership_applications")
    .update({
      status: parsed.data.status,
      review_note: parsed.data.reviewNote || null,
      reviewed_by: userId ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.applicationId)
    .eq("organization_id", context.organization.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/membership-form");
}
