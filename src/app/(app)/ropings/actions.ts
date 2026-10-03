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
  adjustmentSeconds: z.number().min(0).max(60),
});

const classOccurrenceSchema = z.object({
  templateId: z.uuid(),
  classificationId: z.union([z.literal(""), z.uuid()]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleType: z.enum(["fixed", "tentative", "follows_previous"]),
  startsAt: z.union([z.literal(""), localDateTime]),
  scheduleNote: z.string().trim().max(120),
  arenaName: z.string().trim().max(80),
  roundCount: z.number().int().min(1).max(20),
  incentiveEnabled: z.boolean(),
  incentiveRules: z.array(incentiveRuleSchema),
  cattleDrawEnabled: z.boolean(),
  maleEligibilityPolicy: z.enum([
    "producer_default",
    "none",
    "age",
    "classification",
    "age_and_classification",
    "age_or_classification",
  ]),
  maleYouthMaximumAge: z.number().int().min(0).max(120).nullable(),
  maleSeniorMinimumAge: z.number().int().min(0).max(120).nullable(),
  maleClassificationDisciplineId: z.uuid().nullable(),
  maleMinimumClassificationNumber: z.number().min(0).max(100).nullable(),
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

function getClassOccurrences(formData: FormData) {
  try {
    const parsed = z
      .array(classOccurrenceSchema)
      .min(1)
      .safeParse(JSON.parse(String(formData.get("classOccurrences") ?? "[]")));
    if (!parsed.success) return null;

    for (const [index, occurrence] of parsed.data.entries()) {
      if (
        occurrence.scheduleType !== "follows_previous" &&
        (!occurrence.startsAt ||
          !occurrence.startsAt.startsWith(occurrence.scheduledDate))
      )
        return null;
      if (
        occurrence.scheduleType === "follows_previous" &&
        !parsed.data
          .slice(0, index)
          .some(
            (previous) => previous.scheduledDate === occurrence.scheduledDate,
          )
      )
        return null;
      if (occurrence.incentiveEnabled && !occurrence.incentiveRules.length)
        return null;
      const usesAge = occurrence.maleEligibilityPolicy.includes("age");
      const usesClassification =
        occurrence.maleEligibilityPolicy.includes("classification");
      if (
        (usesAge &&
          occurrence.maleYouthMaximumAge === null &&
          occurrence.maleSeniorMinimumAge === null) ||
        (usesClassification &&
          (!occurrence.maleClassificationDisciplineId ||
            occurrence.maleMinimumClassificationNumber === null))
      )
        return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export async function createRoping(
  _state: RopingFormState,
  formData: FormData,
): Promise<RopingFormState> {
  if (!isSupabaseConfigured())
    return { message: "Connect Supabase before creating live events." };

  const parsed = ropingSchema.safeParse(Object.fromEntries(formData));
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

  const classOccurrences = getClassOccurrences(formData);
  if (!classOccurrences)
    return {
      errors: {
        classOccurrences: [
          "Check each scheduled roping's date, time, rounds, order, and incentive settings.",
        ],
      },
    };

  const eventStartDate = parsed.data.startsAt.slice(0, 10);
  const eventEndDate = (parsed.data.endsAt || parsed.data.startsAt).slice(
    0,
    10,
  );
  if (
    classOccurrences.some(
      (occurrence) =>
        occurrence.scheduledDate < eventStartDate ||
        occurrence.scheduledDate > eventEndDate,
    )
  )
    return {
      errors: {
        classOccurrences: [
          "Every scheduled roping must fall within the event's date range.",
        ],
      },
    };

  const shortRoundEnabled = formData.get("shortRoundEnabled") === "on";
  const shortRoundTiePolicy = z
    .enum(["advance_all", "fastest_last_round"])
    .safeParse(formData.get("shortRoundTiePolicy"));
  const shortRoundBrackets = getShortRoundBrackets(formData);
  if (
    shortRoundEnabled &&
    (!shortRoundBrackets.success || !shortRoundTiePolicy.success)
  )
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
  const { error } = await supabase.rpc(
    "create_roping_with_short_round_policy",
    {
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
      event_class_occurrences: classOccurrences,
      event_short_round_enabled: shortRoundEnabled,
      event_short_round_brackets: shortRoundBrackets.success
        ? shortRoundBrackets.data
        : [],
      event_short_round_tie_policy: shortRoundTiePolicy.success
        ? shortRoundTiePolicy.data
        : "advance_all",
      event_fee_title: parsed.data.eventFeeTitle,
      event_fee_amount_cents: parsed.data.eventFeeAmount
        ? Math.round(Number(parsed.data.eventFeeAmount) * 100)
        : null,
    },
  );

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
    message: "Event created with its scheduled ropings, fees, and options.",
  };
}
