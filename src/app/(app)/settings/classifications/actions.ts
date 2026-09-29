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

const disciplineSchema = z.object({
  name: z.string().trim().min(1, "Division name is required."),
  description: z.string().trim(),
});

const updateDisciplineSchema = disciplineSchema.extend({
  disciplineId: z.uuid(),
  isActive: z.string().optional(),
});

const classificationSchema = z.object({
  disciplineId: z.uuid(),
  name: z.string().trim().min(1, "Classification name is required."),
  description: z.string().trim(),
  rank: z.coerce.number().int().min(-1000).max(1000),
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
