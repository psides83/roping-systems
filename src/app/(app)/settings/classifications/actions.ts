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
  name: z.string().trim().min(1, "Discipline name is required."),
  description: z.string().trim(),
  watchThreshold: z.union([z.literal(""), z.coerce.number().int().min(1).max(20)]),
});

const classificationSchema = z.object({
  disciplineId: z.uuid(),
  name: z.string().trim().min(1, "Classification name is required."),
  description: z.string().trim(),
  rank: z.coerce.number().int().min(-1000).max(1000),
});

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function createDiscipline(_state: ClassificationFormState, formData: FormData): Promise<ClassificationFormState> {
  const parsed = disciplineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Sign in with manager access to create disciplines." };

  const { error } = await context.supabase.from("disciplines").insert({
    organization_id: context.organization.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    watch_threshold: parsed.data.watchThreshold === "" ? null : parsed.data.watchThreshold,
  });
  if (error) return { message: error.code === "23505" ? "A discipline with that name already exists." : error.message };

  revalidatePath("/settings/classifications");
  return { success: true, message: "Discipline created." };
}

export async function createClassification(_state: ClassificationFormState, formData: FormData): Promise<ClassificationFormState> {
  const parsed = classificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Sign in with manager access to create classifications." };

  const { data: discipline } = await context.supabase
    .from("disciplines")
    .select("id")
    .eq("id", parsed.data.disciplineId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!discipline) return { message: "That discipline is not available in this organization." };

  const { error } = await context.supabase.from("classifications").insert({
    organization_id: context.organization.id,
    discipline_id: discipline.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    rank: parsed.data.rank,
  });
  if (error) return { message: error.code === "23505" ? "That classification already exists in this discipline." : error.message };

  revalidatePath("/settings/classifications");
  return { success: true, message: "Classification created." };
}
