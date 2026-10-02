"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface ClassificationFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const optionalAgeSchema = z
  .union([
    z.literal(""),
    z.coerce.number().int().min(0, "Age cannot be negative.").max(120),
  ])
  .transform((value) => (value === "" ? null : value));

const disciplineSchema = z
  .object({
    name: z.string().trim().min(1, "Division name is required."),
    description: z.string().trim(),
    genderPolicy: z.enum(["open", "women_only"]),
    maleYouthMaximumAge: optionalAgeSchema,
    maleSeniorMinimumAge: optionalAgeSchema,
  })
  .superRefine((data, context) => {
    if (
      data.genderPolicy === "women_only" &&
      data.maleYouthMaximumAge !== null &&
      data.maleSeniorMinimumAge !== null &&
      data.maleYouthMaximumAge >= data.maleSeniorMinimumAge
    )
      context.addIssue({
        code: "custom",
        path: ["maleSeniorMinimumAge"],
        message: "Senior minimum age must be above the youth maximum age.",
      });
  });

const updateDisciplineSchema = disciplineSchema.extend({
  disciplineId: z.uuid(),
  isActive: z.string().optional(),
});

const classificationSchema = z
  .object({
    disciplineId: z.uuid(),
    name: z.string().trim().min(1, "Classification name is required."),
    description: z.string().trim(),
    rank: z.coerce.number().int().min(-1000).max(1000),
    eligibilityType: z.enum(["skill", "open", "age"]),
    minimumAge: optionalAgeSchema,
    maximumAge: optionalAgeSchema,
  })
  .superRefine((data, context) => {
    if (
      data.eligibilityType === "age" &&
      data.minimumAge === null &&
      data.maximumAge === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumAge"],
        message: "Enter a minimum age, maximum age, or both.",
      });
    }
    if (
      data.minimumAge !== null &&
      data.maximumAge !== null &&
      data.minimumAge > data.maximumAge
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumAge"],
        message: "Maximum age must be at least the minimum age.",
      });
    }
  });

const updateClassificationSchema = classificationSchema.extend({
  classificationId: z.uuid(),
  isActive: z.string().optional(),
});
const idSchema = z.uuid();

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function createDiscipline(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = disciplineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to create divisions." };

  const { error } = await context.supabase.from("disciplines").insert({
    organization_id: context.organization.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    watch_threshold: null,
    gender_policy: parsed.data.genderPolicy,
    male_youth_maximum_age:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleYouthMaximumAge
        : null,
    male_senior_minimum_age:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleSeniorMinimumAge
        : null,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A division with that name already exists."
          : error.message,
    };

  revalidatePath("/settings/classifications");
  return { success: true, message: "Division created." };
}

export async function createClassification(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = classificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to create classifications.",
    };

  const { data: discipline } = await context.supabase
    .from("disciplines")
    .select("id")
    .eq("id", parsed.data.disciplineId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!discipline)
    return { message: "That division is not available in this organization." };

  const { error } = await context.supabase.from("classifications").insert({
    organization_id: context.organization.id,
    discipline_id: discipline.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    rank: parsed.data.rank,
    eligibility_type: parsed.data.eligibilityType,
    minimum_age:
      parsed.data.eligibilityType === "age" ? parsed.data.minimumAge : null,
    maximum_age:
      parsed.data.eligibilityType === "age" ? parsed.data.maximumAge : null,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "That classification already exists in this division."
          : error.message,
    };

  revalidatePath("/settings/classifications");
  return { success: true, message: "Classification created." };
}

export async function updateDiscipline(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = updateDisciplineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to edit divisions." };

  const { error } = await context.supabase
    .from("disciplines")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive === "on",
      gender_policy: parsed.data.genderPolicy,
      male_youth_maximum_age:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleYouthMaximumAge
          : null,
      male_senior_minimum_age:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleSeniorMinimumAge
          : null,
    })
    .eq("id", parsed.data.disciplineId)
    .eq("organization_id", context.organization.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A division with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Division updated." };
}

export async function updateClassification(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = updateClassificationSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to edit classifications." };

  const { data: discipline } = await context.supabase
    .from("disciplines")
    .select("id")
    .eq("id", parsed.data.disciplineId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!discipline)
    return { message: "That division is not available in this organization." };
  const { error } = await context.supabase
    .from("classifications")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      rank: parsed.data.rank,
      eligibility_type: parsed.data.eligibilityType,
      minimum_age:
        parsed.data.eligibilityType === "age" ? parsed.data.minimumAge : null,
      maximum_age:
        parsed.data.eligibilityType === "age" ? parsed.data.maximumAge : null,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.classificationId)
    .eq("discipline_id", discipline.id)
    .eq("organization_id", context.organization.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "That classification already exists in this division."
          : error.message,
    };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Classification updated." };
}

function deletionMessage(
  error: { code?: string; message: string },
  record: "division" | "classification",
) {
  if (error.code !== "23503") return error.message;
  return record === "division"
    ? "This division is still used by classifications, templates, members, or event history. Remove those connections before deleting it."
    : "This classification is still used by a template, member, incentive rule, or event history. Remove those connections before deleting it.";
}

export async function deleteDiscipline(
  disciplineId: string,
): Promise<ClassificationFormState> {
  const parsed = idSchema.safeParse(disciplineId);
  if (!parsed.success) return { message: "Choose a valid division." };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to delete divisions." };
  const { data, error } = await context.supabase
    .from("disciplines")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: deletionMessage(error, "division") };
  if (!data) return { message: "That division is no longer available." };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Division deleted." };
}

export async function deleteClassification(
  classificationId: string,
): Promise<ClassificationFormState> {
  const parsed = idSchema.safeParse(classificationId);
  if (!parsed.success) return { message: "Choose a valid classification." };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to delete classifications.",
    };
  const { data, error } = await context.supabase
    .from("classifications")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: deletionMessage(error, "classification") };
  if (!data) return { message: "That classification is no longer available." };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Classification deleted." };
}
