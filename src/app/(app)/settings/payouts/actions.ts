"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export interface PayoutFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const placeSchema = z.object({
  place: z.number().int().positive(),
  percentageBasisPoints: z.number().int().positive().max(10000),
});
const bracketSchema = z.object({
  stageType: z.enum(["go_round", "aggregate", "short_round"]),
  minimumEntries: z.number().int().positive(),
  maximumEntries: z.number().int().positive().nullable(),
  places: z.array(placeSchema).min(1),
});
const formSchema = z.object({
  scheduleId: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(1, "Schedule name is required."),
  description: z.string().trim(),
  addedMoney: z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  paybackPercent: z.coerce.number().positive().max(100),
  goRoundsPercent: z.coerce.number().min(0).max(100),
  aggregatePercent: z.coerce.number().min(0).max(100),
  shortRoundPercent: z.coerce.number().min(0).max(100),
  shortRoundEnabled: z.string().optional(),
  competitionFormat: z.enum(["standard", "four_d"]),
  fourDSettings: z.string().optional(),
  bracketsJson: z.string(),
});

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

export async function savePayoutSchedule(
  _state: PayoutFormState,
  formData: FormData,
): Promise<PayoutFormState> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const shortRoundEnabled = parsed.data.shortRoundEnabled === "on";
  let fourDSettings: z.infer<typeof fourDSettingsSchema> | null = null;
  if (parsed.data.competitionFormat === "four_d") {
    try {
      fourDSettings = fourDSettingsSchema.parse(
        JSON.parse(parsed.data.fourDSettings ?? ""),
      );
    } catch {
      return { message: "Complete the 4D payout settings." };
    }
  }
  let brackets: z.infer<typeof bracketSchema>[];
  try {
    brackets = z
      .array(bracketSchema)
      .min(1)
      .parse(JSON.parse(parsed.data.bracketsJson));
  } catch {
    return { message: "Check the entry ranges and payout percentages." };
  }
  for (const bracket of brackets) {
    if (
      bracket.maximumEntries !== null &&
      bracket.maximumEntries < bracket.minimumEntries
    )
      return { message: "A maximum entry count cannot be below its minimum." };
    if (
      bracket.places.reduce(
        (sum, place) => sum + place.percentageBasisPoints,
        0,
      ) !== 10000
    )
      return {
        message:
          "Each bracket must distribute exactly 100% of its payout pool.",
      };
  }
  const requiredStages = shortRoundEnabled
    ? (["go_round", "aggregate", "short_round"] as const)
    : (["go_round", "aggregate"] as const);
  for (const stageType of requiredStages) {
    if (!brackets.some((bracket) => bracket.stageType === stageType))
      return {
        message: `Add an entry bracket for ${stageType.replaceAll("_", " ")}.`,
      };
  }
  if (
    !shortRoundEnabled &&
    brackets.some((bracket) => bracket.stageType === "short_round")
  )
    return {
      message: "Enable short-round payouts before adding its schedule.",
    };
  if (shortRoundEnabled && parsed.data.shortRoundPercent <= 0)
    return { message: "Enter a short-round purse allocation greater than 0%." };
  if (
    parsed.data.goRoundsPercent +
      parsed.data.aggregatePercent +
      (shortRoundEnabled ? parsed.data.shortRoundPercent : 0) !==
    100
  )
    return {
      message: shortRoundEnabled
        ? "Go-round, aggregate, and short-round allocations must total 100%."
        : "Go-round and aggregate allocations must total 100%.",
    };

  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    return { message: "Manager access is required." };
  const supabase = await createClient();
  if (parsed.data.scheduleId) {
    const { data: assignedTemplates, error: assignmentError } = await supabase
      .from("division_templates")
      .select("name, competition_format")
      .eq("organization_id", organization.id)
      .eq("payout_schedule_id", parsed.data.scheduleId);
    if (assignmentError) return { message: assignmentError.message };
    const incompatibleTemplate = assignedTemplates?.find(
      (template) =>
        (template.competition_format === "four_d" ? "four_d" : "standard") !==
        parsed.data.competitionFormat,
    );
    if (incompatibleTemplate)
      return {
        message: `Reassign the payout schedule for ${incompatibleTemplate.name} before changing this schedule's format.`,
      };
  }
  const { error } = await supabase.rpc("save_payout_schedule_v2", {
    target_organization_id: organization.id,
    target_schedule_id: parsed.data.scheduleId || null,
    schedule_name: parsed.data.name,
    schedule_description: parsed.data.description,
    added_money_cents: Math.round(Number(parsed.data.addedMoney) * 100),
    schedule_payback_basis_points: Math.round(parsed.data.paybackPercent * 100),
    schedule_go_rounds_basis_points: Math.round(
      parsed.data.goRoundsPercent * 100,
    ),
    schedule_aggregate_basis_points: Math.round(
      parsed.data.aggregatePercent * 100,
    ),
    schedule_short_round_basis_points: Math.round(
      (shortRoundEnabled ? parsed.data.shortRoundPercent : 0) * 100,
    ),
    schedule_short_round_enabled: shortRoundEnabled,
    schedule_competition_format: parsed.data.competitionFormat,
    schedule_four_d_settings: fourDSettings,
    schedule_brackets: brackets,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A payout schedule with that name or entry range already exists."
          : error.message,
    };
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Payout schedule saved." };
}

const assignmentSchema = z.object({
  divisionId: z.uuid(),
  scheduleId: z.union([z.literal(""), z.uuid()]),
});

export async function assignDivisionPayout(formData: FormData) {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return;
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("division_templates")
    .select("id, competition_format")
    .eq("id", parsed.data.divisionId)
    .eq("organization_id", organization.id)
    .single();
  if (
    !template ||
    (!parsed.data.scheduleId && template.competition_format === "four_d")
  )
    return;
  if (parsed.data.scheduleId) {
    const { data: schedule } = await supabase
      .from("payout_schedules")
      .select("id, competition_format")
      .eq("id", parsed.data.scheduleId)
      .eq("organization_id", organization.id)
      .single();
    if (!schedule) return;
    const requiredFormat =
      template.competition_format === "four_d" ? "four_d" : "standard";
    if (schedule.competition_format !== requiredFormat) return;
  }
  await supabase
    .from("division_templates")
    .update({ payout_schedule_id: parsed.data.scheduleId || null })
    .eq("id", parsed.data.divisionId)
    .eq("organization_id", organization.id);
  revalidatePath("/settings/payouts");
}

export async function deletePayoutSchedule(
  scheduleId: string,
): Promise<PayoutFormState> {
  const parsed = z.uuid().safeParse(scheduleId);
  if (!parsed.success) return { message: "Choose a valid payout schedule." };
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    return { message: "Manager access is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payout_schedules")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", organization.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "That payout schedule is no longer available." };
  revalidatePath("/settings/payouts");
  revalidatePath("/settings/divisions");
  return { success: true, message: "Payout schedule deleted." };
}
