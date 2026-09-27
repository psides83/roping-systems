"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface SettingsFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const divisionSchema = z.object({
  name: z.string().trim().min(1, "Division name is required."),
  description: z.string().trim(),
  numberOfRuns: z.coerce.number().int().min(1).max(20),
  maximumEntries: z.union([z.literal(""), z.coerce.number().int().min(1).max(100)]),
  allowGuests: z.string().optional(),
});

const feeSchema = z.object({
  divisionId: z.uuid(),
  title: z.string().trim().min(1, "Fee title is required."),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  scope: z.enum(["entry", "contestant_division", "contestant_event"]),
  includedInEntryPrice: z.string().optional(),
  contributesToPayout: z.string().optional(),
});

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function createDivision(_state: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = divisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Connect Supabase and sign in with manager access to create divisions." };

  const { error } = await context.supabase.from("division_templates").insert({ organization_id: context.organization.id, name: parsed.data.name, description: parsed.data.description || null, number_of_runs: parsed.data.numberOfRuns, maximum_entries_per_person: parsed.data.maximumEntries === "" ? null : parsed.data.maximumEntries, allow_guests: parsed.data.allowGuests === "on" });
  if (error) return { message: error.code === "23505" ? "A division with that name already exists." : error.message };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Division created." };
}

export async function createFee(_state: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const parsed = feeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Connect Supabase and sign in with manager access to create fees." };

  const { data: division } = await context.supabase.from("division_templates").select("id").eq("id", parsed.data.divisionId).eq("organization_id", context.organization.id).single();
  if (!division) return { message: "That division is not available in this organization." };
  const { error } = await context.supabase.from("fee_templates").insert({ organization_id: context.organization.id, division_template_id: division.id, title: parsed.data.title, amount_cents: Math.round(Number(parsed.data.amount) * 100), scope: parsed.data.scope, included_in_entry_price: parsed.data.includedInEntryPrice === "on", contributes_to_payout: parsed.data.contributesToPayout === "on" });
  if (error) return { message: error.message };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Fee added." };
}
