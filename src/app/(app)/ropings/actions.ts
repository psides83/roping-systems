"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface RopingFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid date and time.");
const ropingSchema = z.object({
  title: z.string().trim().min(2, "Event title is required."),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only.",
    ),
  venueName: z.string().trim(),
  address: z.string().trim(),
  startsAt: localDateTime,
  endsAt: z.union([z.literal(""), localDateTime]),
  entriesOpenAt: z.union([z.literal(""), localDateTime]),
  entriesCloseAt: z.union([z.literal(""), localDateTime]),
  isPublic: z.string().optional(),
  eventFeeTitle: z.string().trim(),
  eventFeeAmount: z.union([
    z.literal(""),
    z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  ]),
});

const incentiveRuleSchema = z.object({
  classificationId: z.uuid(),
  adjustmentSeconds: z.number().positive().max(60),
});

const roundCountSchema = z.object({
  divisionTemplateId: z.uuid(),
  roundCount: z.number().int().min(1).max(20),
});

const shortRoundBracketSchema = z
  .array(
    z.object({
      minimumEntries: z.number().int().min(1),
      maximumEntries: z.number().int().min(1).nullable(),
      comebackCount: z.number().int().min(1),
    }),
  )
  .min(1);

function getShortRoundBrackets(formData: FormData) {
  try {
    return shortRoundBracketSchema.safeParse(
      JSON.parse(String(formData.get("shortRoundBrackets") ?? "[]")),
    );
  } catch {
    return shortRoundBracketSchema.safeParse([]);
  }
}

function getClassSettings(formData: FormData, divisionIds: string[]) {
  const settings: Array<{
    divisionTemplateId: string;
    startsAt: string;
    incentiveEnabled: boolean;
    incentiveRules: Array<z.infer<typeof incentiveRuleSchema>>;
  }> = [];
  for (const divisionTemplateId of divisionIds) {
    const incentiveEnabled =
      formData.get(`incentiveEnabled-${divisionTemplateId}`) === "on";
    const incentiveRules: Array<z.infer<typeof incentiveRuleSchema>> = [];
    for (const [key, value] of formData.entries()) {
      const prefix = `incentiveAdjustment-${divisionTemplateId}-`;
      if (
        !key.startsWith(prefix) ||
        typeof value !== "string" ||
        !value.trim() ||
        Number(value) === 0
      )
        continue;
      const parsed = incentiveRuleSchema.safeParse({
        classificationId: key.replace(prefix, ""),
        adjustmentSeconds: Number(value),
      });
      if (!parsed.success) return null;
      incentiveRules.push(parsed.data);
    }
    if (incentiveEnabled && !incentiveRules.length) return null;
    settings.push({
      divisionTemplateId,
      startsAt: String(
        formData.get(`classStartsAt-${divisionTemplateId}`) ?? "",
      ),
      incentiveEnabled,
      incentiveRules,
    });
  }
  return settings;
}

function getRoundCounts(formData: FormData, divisionIds: string[]) {
  const settings: Array<z.infer<typeof roundCountSchema>> = [];
  for (const divisionTemplateId of divisionIds) {
    const parsed = roundCountSchema.safeParse({
      divisionTemplateId,
      roundCount: Number(formData.get(`roundCount-${divisionTemplateId}`)),
    });
    if (!parsed.success) return null;
    settings.push(parsed.data);
  }
  return settings;
}

export async function createRoping(
  _state: RopingFormState,
  formData: FormData,
): Promise<RopingFormState> {
  if (!isSupabaseConfigured())
    return { message: "Connect Supabase before creating live events." };
  const parsed = ropingSchema.safeParse(Object.fromEntries(formData));
  const divisionIds = formData.getAll("divisionIds").map(String);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (parsed.data.endsAt && parsed.data.endsAt < parsed.data.startsAt)
    return { errors: { endsAt: ["The event end must be after its start."] } };
  if (
    Boolean(parsed.data.eventFeeTitle) !== Boolean(parsed.data.eventFeeAmount)
  )
    return {
      errors: {
        eventFeeAmount: [
          "Enter both a charge name and amount, or leave both blank.",
        ],
      },
    };
  if (!divisionIds.length)
    return { errors: { divisionIds: ["Select at least one class."] } };
  const roundCounts = getRoundCounts(formData, divisionIds);
  if (!roundCounts)
    return {
      errors: {
        roundCounts: [
          "Set a round count between 1 and 20 for every selected class.",
        ],
      },
    };
  const classSettings = getClassSettings(formData, divisionIds);
  if (!classSettings)
    return {
      errors: {
        incentiveRules: [
          "Each incentive class needs at least one valid adjustment between 0 and 60 seconds.",
        ],
      },
    };
  const shortRoundEnabled = formData.get("shortRoundEnabled") === "on";
  const shortRoundBrackets = getShortRoundBrackets(formData);
  if (shortRoundEnabled && !shortRoundBrackets.success)
    return {
      errors: {
        shortRoundBrackets: [
          "Add at least one valid entry range and comeback count.",
        ],
      },
    };

  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    return { message: "You do not have permission to create events." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_roping_with_class_settings", {
    target_organization_id: organization.id,
    event_title: parsed.data.title,
    event_slug: parsed.data.slug,
    event_venue_name: parsed.data.venueName,
    event_address: parsed.data.address,
    event_starts_at_local: parsed.data.startsAt,
    event_ends_at_local: parsed.data.endsAt || null,
    event_entries_open_at_local: parsed.data.entriesOpenAt || null,
    event_entries_close_at_local: parsed.data.entriesCloseAt || null,
    event_is_public: parsed.data.isPublic === "on",
    selected_division_template_ids: divisionIds,
    event_round_counts: roundCounts,
    event_short_round_enabled: shortRoundEnabled,
    event_short_round_brackets: shortRoundBrackets.success
      ? shortRoundBrackets.data
      : [],
    event_class_settings: classSettings,
    event_fee_title: parsed.data.eventFeeTitle,
    event_fee_amount_cents: parsed.data.eventFeeAmount
      ? Math.round(Number(parsed.data.eventFeeAmount) * 100)
      : null,
  });

  if (error)
    return {
      message:
        error.code === "23505"
          ? "An event already uses that public URL."
          : error.message,
    };
  revalidatePath("/ropings");
  return {
    success: true,
    message: "Event created with its class ropings, fees, and options.",
  };
}
