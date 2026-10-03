"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";

export interface SettingsFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const divisionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Template name is required.")
    .transform(formatProperNoun),
  description: z.string().trim(),
  disciplineId: z.uuid(),
  maximumEntries: z.union([
    z.literal(""),
    z.coerce.number().int().min(1).max(100),
  ]),
  minimumRunsBetweenEntries: z.coerce.number().int().min(0).max(100),
  numberOfRuns: z.coerce.number().int().min(1).max(20),
  cattleDrawEnabled: z.string().optional(),
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
  payoutScheduleId: z.union([z.literal(""), z.uuid()]),
  isActive: z.string().optional(),
  handicapRules: z.string(),
  shortRoundEnabled: z.string().optional(),
  shortRoundTiePolicy: z.enum(["advance_all", "fastest_last_round"]),
  shortRoundBrackets: z.string(),
});

const handicapRulesSchema = z.array(
  z.object({
    classificationId: z.uuid(),
    adjustmentSeconds: z.coerce.number().min(0).max(60),
  }),
);

function parseHandicapRules(value: string) {
  try {
    return handicapRulesSchema.safeParse(JSON.parse(value));
  } catch {
    return handicapRulesSchema.safeParse(null);
  }
}

const shortRoundBracketsSchema = z
  .array(
    z.object({
      minimumEntries: z.number().int().min(1),
      maximumEntries: z.number().int().min(1).nullable(),
      comebackCount: z.number().int().min(1),
    }),
  )
  .min(1)
  .superRefine((brackets, context) => {
    for (const [index, bracket] of brackets.entries()) {
      if (
        bracket.maximumEntries !== null &&
        bracket.maximumEntries < bracket.minimumEntries
      )
        context.addIssue({
          code: "custom",
          message: "A maximum entry count cannot be below its minimum.",
          path: [index, "maximumEntries"],
        });
      for (const other of brackets.slice(index + 1)) {
        const firstMaximum = bracket.maximumEntries ?? Number.MAX_SAFE_INTEGER;
        const secondMaximum = other.maximumEntries ?? Number.MAX_SAFE_INTEGER;
        if (
          bracket.minimumEntries <= secondMaximum &&
          other.minimumEntries <= firstMaximum
        )
          context.addIssue({
            code: "custom",
            message: "Short-round entry ranges cannot overlap.",
          });
      }
    }
  });

function parseShortRoundBrackets(value: string) {
  try {
    return shortRoundBracketsSchema.safeParse(JSON.parse(value));
  } catch {
    return shortRoundBracketsSchema.safeParse(null);
  }
}

const updateDivisionSchema = divisionSchema.extend({ divisionId: z.uuid() });

const feeSchema = z.object({
  divisionId: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Fee title is required.")
    .transform(formatProperNoun),
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

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

async function validateHandicapRuleRelationships(
  context: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  disciplineId: string,
  rules: z.infer<typeof handicapRulesSchema>,
) {
  const classificationIds = rules.map((rule) => rule.classificationId);
  if (new Set(classificationIds).size !== classificationIds.length)
    return { error: "Each member classification may appear only once." };

  const { data, error } = await context.supabase
    .from("classifications")
    .select("id, handicap_adjustment_seconds")
    .eq("organization_id", context.organization.id)
    .eq("discipline_id", disciplineId)
    .eq("is_active", true)
    .in("id", classificationIds);
  if (
    error ||
    data.length !== classificationIds.length ||
    data.some(
      (classification) => classification.handicap_adjustment_seconds === null,
    )
  )
    return { error: "One or more handicap classifications are unavailable." };
  const adjustments = new Map(
    data.map((classification) => [
      classification.id,
      Number(classification.handicap_adjustment_seconds),
    ]),
  );
  return {
    rules: classificationIds.map((classificationId) => ({
      classificationId,
      adjustmentSeconds: adjustments.get(classificationId)!,
    })),
  };
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
        "Connect Supabase and sign in with manager access to create roping templates.",
    };

  const relationshipError = await validateTemplateRelationships(
    context,
    parsed.data.disciplineId,
    parsed.data.payoutScheduleId,
    parsed.data.competitionFormat,
  );
  if (relationshipError) return { message: relationshipError };
  const handicapRules = parseHandicapRules(parsed.data.handicapRules);
  if (
    parsed.data.competitionFormat === "handicap" &&
    (!handicapRules.success || !handicapRules.data.length)
  )
    return {
      message:
        "Add at least one member classification for this handicap template.",
    };
  let resolvedHandicapRules: z.infer<typeof handicapRulesSchema> = [];
  if (parsed.data.competitionFormat === "handicap" && handicapRules.success) {
    const handicapResult = await validateHandicapRuleRelationships(
      context,
      parsed.data.disciplineId,
      handicapRules.data,
    );
    if (handicapResult.error) return { message: handicapResult.error };
    resolvedHandicapRules = handicapResult.rules ?? [];
  }
  const shortRoundEnabled = parsed.data.shortRoundEnabled === "on";
  const shortRoundBrackets = parseShortRoundBrackets(
    parsed.data.shortRoundBrackets,
  );
  if (!shortRoundBrackets.success)
    return { message: "Add at least one valid short-round entry range." };
  const { error } = await context.supabase.from("division_templates").insert({
    organization_id: context.organization.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    discipline_id: parsed.data.disciplineId,
    classification_id: null,
    maximum_entries_per_person:
      parsed.data.maximumEntries === "" ? null : parsed.data.maximumEntries,
    minimum_runs_between_entries: parsed.data.minimumRunsBetweenEntries,
    number_of_runs: parsed.data.numberOfRuns,
    cattle_draw_enabled: parsed.data.cattleDrawEnabled === "on",
    allow_guests: parsed.data.allowGuests === "on",
    timer_count: parsed.data.timerCount,
    timer_resolution: parsed.data.timerResolution,
    competition_format: parsed.data.competitionFormat,
    handicap_rules:
      parsed.data.competitionFormat === "handicap" ? resolvedHandicapRules : [],
    second_round_ordering: parsed.data.secondRoundOrdering,
    later_round_ordering: parsed.data.laterRoundOrdering,
    four_d_settings: null,
    payout_schedule_id: parsed.data.payoutScheduleId || null,
    short_round_enabled: shortRoundEnabled,
    short_round_tie_policy: parsed.data.shortRoundTiePolicy,
    short_round_brackets: shortRoundBrackets.data,
    is_active: parsed.data.isActive === "on",
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A roping template with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/divisions");
  return { success: true, message: "Roping template created." };
}

async function validateTemplateRelationships(
  context: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  disciplineId: string,
  payoutScheduleId: string,
  competitionFormat: "standard" | "handicap" | "four_d",
) {
  const { data: discipline } = await context.supabase
    .from("disciplines")
    .select("id")
    .eq("id", disciplineId)
    .eq("organization_id", context.organization.id)
    .single();
  if (!discipline)
    return "Choose a division that belongs to this organization.";
  if (payoutScheduleId) {
    const { data: schedule } = await context.supabase
      .from("payout_schedules")
      .select("id, competition_format")
      .eq("id", payoutScheduleId)
      .eq("organization_id", context.organization.id)
      .single();
    if (!schedule)
      return "That payout schedule is not available in this organization.";
    const requiredFormat =
      competitionFormat === "four_d" ? "four_d" : "standard";
    if (schedule.competition_format !== requiredFormat)
      return competitionFormat === "four_d"
        ? "Choose a 4D payout schedule for this template."
        : "Choose a standard payout schedule for this template.";
  } else if (competitionFormat === "four_d") {
    return "Choose a 4D payout schedule for this template.";
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
    return { message: "Sign in with manager access to edit roping templates." };
  const relationshipError = await validateTemplateRelationships(
    context,
    parsed.data.disciplineId,
    parsed.data.payoutScheduleId,
    parsed.data.competitionFormat,
  );
  if (relationshipError) return { message: relationshipError };
  const handicapRules = parseHandicapRules(parsed.data.handicapRules);
  if (
    parsed.data.competitionFormat === "handicap" &&
    (!handicapRules.success || !handicapRules.data.length)
  )
    return {
      message:
        "Add at least one member classification for this handicap template.",
    };
  let resolvedHandicapRules: z.infer<typeof handicapRulesSchema> = [];
  if (parsed.data.competitionFormat === "handicap" && handicapRules.success) {
    const handicapResult = await validateHandicapRuleRelationships(
      context,
      parsed.data.disciplineId,
      handicapRules.data,
    );
    if (handicapResult.error) return { message: handicapResult.error };
    resolvedHandicapRules = handicapResult.rules ?? [];
  }
  const shortRoundEnabled = parsed.data.shortRoundEnabled === "on";
  const shortRoundBrackets = parseShortRoundBrackets(
    parsed.data.shortRoundBrackets,
  );
  if (!shortRoundBrackets.success)
    return { message: "Add at least one valid short-round entry range." };
  const { error } = await context.supabase
    .from("division_templates")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      discipline_id: parsed.data.disciplineId,
      classification_id: null,
      maximum_entries_per_person:
        parsed.data.maximumEntries === "" ? null : parsed.data.maximumEntries,
      minimum_runs_between_entries: parsed.data.minimumRunsBetweenEntries,
      number_of_runs: parsed.data.numberOfRuns,
      cattle_draw_enabled: parsed.data.cattleDrawEnabled === "on",
      allow_guests: parsed.data.allowGuests === "on",
      timer_count: parsed.data.timerCount,
      timer_resolution: parsed.data.timerResolution,
      competition_format: parsed.data.competitionFormat,
      handicap_rules:
        parsed.data.competitionFormat === "handicap"
          ? resolvedHandicapRules
          : [],
      second_round_ordering: parsed.data.secondRoundOrdering,
      later_round_ordering: parsed.data.laterRoundOrdering,
      four_d_settings: null,
      payout_schedule_id: parsed.data.payoutScheduleId || null,
      short_round_enabled: shortRoundEnabled,
      short_round_tie_policy: parsed.data.shortRoundTiePolicy,
      short_round_brackets: shortRoundBrackets.data,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.divisionId)
    .eq("organization_id", context.organization.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A roping template with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/divisions");
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/timing");
  revalidatePath("/ropings");
  return { success: true, message: "Roping template updated." };
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
      message: "That roping template is not available in this organization.",
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
  if (!parsed.success) return { message: "Choose a valid roping template." };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to delete roping templates.",
    };
  const { data, error } = await context.supabase
    .from("division_templates")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", context.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "That roping template is no longer available." };
  revalidatePath("/settings/divisions");
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/timing");
  revalidatePath("/ropings");
  return { success: true, message: "Roping template deleted." };
}

export async function duplicateDivision(
  divisionId: string,
): Promise<SettingsFormState> {
  const parsed = idSchema.safeParse(divisionId);
  if (!parsed.success) return { message: "Choose a valid roping template." };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to duplicate roping templates.",
    };
  const { error } = await context.supabase.rpc("duplicate_division_template", {
    target_organization_id: context.organization.id,
    source_template_id: parsed.data,
  });
  if (error) return { message: error.message };
  revalidatePath("/settings/divisions");
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/timing");
  revalidatePath("/ropings");
  return { success: true, message: "Roping template duplicated." };
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
