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
  bracketsJson: z.string(),
});

export async function savePayoutSchedule(
  _state: PayoutFormState,
  formData: FormData,
): Promise<PayoutFormState> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
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
  if (parsed.data.goRoundsPercent + parsed.data.aggregatePercent !== 100)
    return {
      message: "Go-round and aggregate allocations must total 100%.",
    };

  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    return { message: "Manager access is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_payout_schedule", {
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
  if (parsed.data.scheduleId) {
    const { data: schedule } = await supabase
      .from("payout_schedules")
      .select("id")
      .eq("id", parsed.data.scheduleId)
      .eq("organization_id", organization.id)
      .single();
    if (!schedule) return;
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
