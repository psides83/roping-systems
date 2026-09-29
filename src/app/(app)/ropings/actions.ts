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
  entriesOpenAt: z.union([z.literal(""), localDateTime]),
  entriesCloseAt: z.union([z.literal(""), localDateTime]),
  isPublic: z.string().optional(),
  incentiveEnabled: z.string().optional(),
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

function getIncentiveRules(formData: FormData) {
  const rules: Array<z.infer<typeof incentiveRuleSchema>> = [];
  for (const [key, value] of formData.entries()) {
    if (
      !key.startsWith("incentiveAdjustment-") ||
      typeof value !== "string" ||
      !value.trim() ||
      Number(value) === 0
    )
      continue;
    const parsed = incentiveRuleSchema.safeParse({
      classificationId: key.replace("incentiveAdjustment-", ""),
      adjustmentSeconds: Number(value),
    });
    if (!parsed.success) return null;
    rules.push(parsed.data);
  }
  return rules;
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
  const incentiveRules = getIncentiveRules(formData);
  if (!incentiveRules)
    return {
      errors: {
        incentiveRules: [
          "Enter valid incentive adjustments between 0 and 60 seconds.",
        ],
      },
    };
  if (parsed.data.incentiveEnabled === "on" && !incentiveRules.length)
    return {
      errors: {
        incentiveRules: [
          "Add at least one classification handicap for an incentive roping.",
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
  const { error } = await supabase.rpc("create_roping_with_short_rounds", {
    target_organization_id: organization.id,
    event_title: parsed.data.title,
    event_slug: parsed.data.slug,
    event_venue_name: parsed.data.venueName,
    event_address: parsed.data.address,
    event_starts_at_local: parsed.data.startsAt,
    event_entries_open_at_local: parsed.data.entriesOpenAt || null,
    event_entries_close_at_local: parsed.data.entriesCloseAt || null,
    event_is_public: parsed.data.isPublic === "on",
    selected_division_template_ids: divisionIds,
    event_incentive_enabled: parsed.data.incentiveEnabled === "on",
    event_incentive_rules: incentiveRules,
    event_round_counts: roundCounts,
    event_short_round_enabled: shortRoundEnabled,
    event_short_round_brackets: shortRoundBrackets.success
      ? shortRoundBrackets.data
      : [],
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
    message: "Roping created with its event templates and fees.",
  };
}
