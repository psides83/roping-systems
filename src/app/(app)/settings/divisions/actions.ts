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
  name: z.string().trim().min(1, "Template name is required."),
  description: z.string().trim(),
  disciplineId: z.uuid(),
  classificationId: z.uuid(),
  maximumEntries: z.union([
    z.literal(""),
    z.coerce.number().int().min(1).max(100),
  ]),
  minimumRunsBetweenEntries: z.coerce.number().int().min(0).max(100),
  allowGuests: z.string().optional(),
  timerCount: z.coerce.number().int().min(1).max(10),
  timerResolution: z.enum(["average", "best", "longest"]),
  competitionFormat: z.enum(["standard", "handicap", "four_d"]),
  secondRoundOrdering: z.enum([
    "reverse_first",
    "aggregate_slowest_to_fastest",
    "custom",
  ]),
  laterRoundOrdering: z.enum([
    "reverse_first",
    "aggregate_slowest_to_fastest",
    "custom",
  ]),
  fourDSettings: z.string().optional(),
  payoutScheduleId: z.union([z.literal(""), z.uuid()]),
  isActive: z.string().optional(),
});

const updateDivisionSchema = divisionSchema.extend({ divisionId: z.uuid() });

const feeSchema = z.object({
  divisionId: z.uuid(),
  title: z.string().trim().min(1, "Fee title is required."),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  scope: z.enum(["entry", "contestant_division", "contestant_event"]),
  kind: z.enum(["standard", "insurance", "side_pot", "other"]),
  payoutScheduleId: z.union([z.literal(""), z.uuid()]),
  includedInEntryPrice: z.string().optional(),
  contributesToPayout: z.string().optional(),
  isRequired: z.string().optional(),
});

const updateFeeSchema = feeSchema.extend({ feeId: z.uuid() });
const idSchema = z.uuid();

const fourDBracketSchema = z.object({
  minimumEntries: z.number().int().min(1),
  maximumEntries: z.number().int().min(1).nullable(),
  activeDivisions: z.number().int().min(1).max(4),
  purseBasisPoints: z.tuple([
    z.number().int().min(0),
    z.number().int().min(0),
    z.number().int().min(0),
    z.number().int().min(0),
  ]),
  placesByDivision: z.tuple([
    z.number().int().min(0),
    z.number().int().min(0),
    z.number().int().min(0),
    z.number().int().min(0),
  ]),
});

const fourDSettingsSchema = z.object({
  splitSeconds: z.number().positive().max(60),
  brackets: z.array(fourDBracketSchema).min(1),
});

function parseFourDSettings(
  competitionFormat: z.infer<typeof divisionSchema>["competitionFormat"],
  rawSettings?: string,
) {
  if (competitionFormat !== "four_d") return { data: null } as const;
  try {
    const parsed = fourDSettingsSchema.safeParse(JSON.parse(rawSettings ?? ""));
    if (!parsed.success)
      return { error: "Complete the 4D scoring settings." } as const;
    for (const bracket of parsed.data.brackets) {
      if (
        bracket.maximumEntries !== null &&
        bracket.maximumEntries < bracket.minimumEntries
      )
        return { error: "A 4D entry range ends before it begins." } as const;
      const purseTotal = bracket.purseBasisPoints
        .slice(0, bracket.activeDivisions)
        .reduce((total, value) => total + value, 0);
      if (purseTotal !== 10000)
        return {
          error: "Each 4D entry bracket must allocate 100% of the purse.",
        } as const;
      if (
        bracket.placesByDivision
          .slice(0, bracket.activeDivisions)
          .some((places) => places < 1)
      )
        return { error: "Each active D must pay at least one place." } as const;
    }
    return { data: parsed.data } as const;
  } catch {
    return { error: "Complete the 4D scoring settings." } as const;
  }
}

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function createDivision(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = divisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return {
      message:
        "Connect Supabase and sign in with manager access to create event templates.",
    };

  const fourDSettings = parseFourDSettings(
    parsed.data.competitionFormat,
    parsed.data.fourDSettings,
  );
  if ("error" in fourDSettings) return { message: fourDSettings.error };

  const relationshipError = await validateTemplateRelationships(
    context,
    parsed.data.disciplineId,
    parsed.data.classificationId,
    parsed.data.payoutScheduleId,
  );
  if (relationshipError) return { message: relationshipError };
  const { error } = await context.supabase.from("division_templates").insert({
    organization_id: context.organization.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    discipline_id: parsed.data.disciplineId,
    classification_id: parsed.data.classificationId,
    maximum_entries_per_person:
      parsed.data.maximumEntries === "" ? null : parsed.data.maximumEntries,
    minimum_runs_between_entries: parsed.data.minimumRunsBetweenEntries,
    allow_guests: parsed.data.allowGuests === "on",
    timer_count: parsed.data.timerCount,
    timer_resolution: parsed.data.timerResolution,
    competition_format: parsed.data.competitionFormat,
    second_round_ordering: parsed.data.secondRoundOrdering,
    later_round_ordering: parsed.data.laterRoundOrdering,
    four_d_settings: fourDSettings.data,
    payout_schedule_id: parsed.data.payoutScheduleId || null,
    is_active: parsed.data.isActive === "on",
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "An event template with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Event template created." };
}

async function validateTemplateRelationships(
  context: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  disciplineId: string,
  classificationId: string,
  payoutScheduleId: string,
) {
  const { data: classification } = await context.supabase
    .from("classifications")
    .select("id")
    .eq("id", classificationId)
    .eq("discipline_id", disciplineId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!classification)
    return "Choose a classification that belongs to the selected division.";
  if (payoutScheduleId) {
    const { data: schedule } = await context.supabase
      .from("payout_schedules")
      .select("id")
      .eq("id", payoutScheduleId)
      .eq("organization_id", context.organization.id)
      .single();
    if (!schedule)
      return "That payout schedule is not available in this organization.";
  }
  return null;
}

export async function updateDivision(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = updateDivisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to edit event templates." };
  const fourDSettings = parseFourDSettings(
    parsed.data.competitionFormat,
    parsed.data.fourDSettings,
  );
  if ("error" in fourDSettings) return { message: fourDSettings.error };
  const relationshipError = await validateTemplateRelationships(
    context,
    parsed.data.disciplineId,
    parsed.data.classificationId,
    parsed.data.payoutScheduleId,
  );
  if (relationshipError) return { message: relationshipError };
  const { error } = await context.supabase
    .from("division_templates")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      discipline_id: parsed.data.disciplineId,
      classification_id: parsed.data.classificationId,
      maximum_entries_per_person:
        parsed.data.maximumEntries === "" ? null : parsed.data.maximumEntries,
      minimum_runs_between_entries: parsed.data.minimumRunsBetweenEntries,
      allow_guests: parsed.data.allowGuests === "on",
      timer_count: parsed.data.timerCount,
      timer_resolution: parsed.data.timerResolution,
      competition_format: parsed.data.competitionFormat,
      second_round_ordering: parsed.data.secondRoundOrdering,
      later_round_ordering: parsed.data.laterRoundOrdering,
      four_d_settings: fourDSettings.data,
      payout_schedule_id: parsed.data.payoutScheduleId || null,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.divisionId)
    .eq("organization_id", context.organization.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "An event template with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/divisions");
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/timing");
  revalidatePath("/ropings");
  return { success: true, message: "Event template updated." };
}

export async function createFee(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = feeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return {
      message:
        "Connect Supabase and sign in with manager access to create fees.",
    };

  const { data: division } = await context.supabase
    .from("division_templates")
    .select("id")
    .eq("id", parsed.data.divisionId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!division)
    return {
      message: "That event template is not available in this organization.",
    };
  if (parsed.data.payoutScheduleId) {
    const { data: schedule } = await context.supabase
      .from("payout_schedules")
      .select("id")
      .eq("id", parsed.data.payoutScheduleId)
      .eq("organization_id", context.organization.id)
      .single();
    if (!schedule)
      return {
        message: "That payout schedule is not available in this organization.",
      };
  }
  if (
    ["side_pot", "insurance"].includes(parsed.data.kind) &&
    !parsed.data.payoutScheduleId
  )
    return { message: "Choose a payout schedule for this optional pool." };
  const { error } = await context.supabase.from("fee_templates").insert({
    organization_id: context.organization.id,
    division_template_id: division.id,
    title: parsed.data.title,
    amount_cents: Math.round(Number(parsed.data.amount) * 100),
    scope: parsed.data.scope,
    kind: parsed.data.kind,
    payout_schedule_id: parsed.data.payoutScheduleId || null,
    included_in_entry_price: parsed.data.includedInEntryPrice === "on",
    contributes_to_payout:
      ["side_pot", "insurance"].includes(parsed.data.kind) ||
      parsed.data.contributesToPayout === "on",
    is_required: parsed.data.isRequired === "on",
  });
  if (error) return { message: error.message };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Fee added." };
}

export async function updateFee(
  _state: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const parsed = updateFeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context) return { message: "Sign in with manager access to edit fees." };
  const { data: fee } = await context.supabase
    .from("fee_templates")
    .select("id")
    .eq("id", parsed.data.feeId)
    .eq("division_template_id", parsed.data.divisionId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!fee)
    return { message: "That fee is not available in this organization." };
  if (parsed.data.payoutScheduleId) {
    const { data: schedule } = await context.supabase
      .from("payout_schedules")
      .select("id")
      .eq("id", parsed.data.payoutScheduleId)
      .eq("organization_id", context.organization.id)
      .single();
    if (!schedule)
      return {
        message: "That payout schedule is not available in this organization.",
      };
  }
  if (
    ["side_pot", "insurance"].includes(parsed.data.kind) &&
    !parsed.data.payoutScheduleId
  )
    return { message: "Choose a payout schedule for this optional pool." };
  const { error } = await context.supabase
    .from("fee_templates")
    .update({
      title: parsed.data.title,
      amount_cents: Math.round(Number(parsed.data.amount) * 100),
      scope: parsed.data.scope,
      kind: parsed.data.kind,
      payout_schedule_id: parsed.data.payoutScheduleId || null,
      included_in_entry_price: parsed.data.includedInEntryPrice === "on",
      contributes_to_payout:
        ["side_pot", "insurance"].includes(parsed.data.kind) ||
        parsed.data.contributesToPayout === "on",
      is_required: parsed.data.isRequired === "on",
    })
    .eq("id", fee.id)
    .eq("organization_id", context.organization.id);
  if (error) return { message: error.message };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Fee updated." };
}

export async function deleteDivision(
  divisionId: string,
): Promise<SettingsFormState> {
  const parsed = idSchema.safeParse(divisionId);
  if (!parsed.success) return { message: "Choose a valid event template." };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to delete event templates.",
    };
  const { data, error } = await context.supabase
    .from("division_templates")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "That event template is no longer available." };
  revalidatePath("/settings/divisions");
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/timing");
  revalidatePath("/ropings");
  return { success: true, message: "Event template deleted." };
}

export async function deleteFee(feeId: string): Promise<SettingsFormState> {
  const parsed = idSchema.safeParse(feeId);
  if (!parsed.success) return { message: "Choose a valid fee or option." };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to delete fees." };
  const { data, error } = await context.supabase
    .from("fee_templates")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "That fee or option is no longer available." };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Fee or option deleted." };
}
