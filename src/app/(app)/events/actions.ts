"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import { refreshEventQualificationChecks } from "@/lib/events/qualification-checks";

export interface RopingFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid date and time.");

const ropingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Event title is required.")
    .transform(formatProperNoun),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only.",
    ),
  venueName: z.string().trim().transform(formatProperNoun),
  address: z.string().trim().transform(formatProperNoun),
  city: z.string().trim().transform(formatProperNoun),
  state: z.string().trim().max(40).transform(formatProperNoun),
  postalCode: z.string().trim().max(20),
  arenaCount: z.coerce.number().int().min(1).max(20),
  startsAt: localDateTime,
  endsAt: z.union([z.literal(""), localDateTime]),
  entriesOpenAt: z.union([z.literal(""), localDateTime]),
  entriesCloseAt: z.union([z.literal(""), localDateTime]),
  publicationState: z.enum(["draft", "published", "unpublished"]),
  eventFeeTitle: z.string().trim().transform(formatProperNoun),
  eventFeeAmount: z.union([
    z.literal(""),
    z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  ]),
});

const incentiveRuleSchema = z.object({
  classificationId: z.uuid(),
  adjustmentSeconds: z.number().min(-60).max(60),
});

const classOccurrenceSchema = z.object({
  templateId: z.uuid(),
  classificationId: z.union([z.literal(""), z.uuid()]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleType: z.enum(["fixed", "tentative", "follows_previous"]),
  startsAt: z.union([z.literal(""), localDateTime]),
  scheduleNote: z.string().trim().max(120),
  arenaName: z.string().trim().min(1).max(80),
  incentiveEnabled: z.boolean(),
  incentiveRules: z.array(incentiveRuleSchema),
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

function getClassOccurrences(formData: FormData, arenaCount: number) {
  try {
    const parsed = z
      .array(classOccurrenceSchema)
      .min(1)
      .safeParse(JSON.parse(String(formData.get("classOccurrences") ?? "[]")));
    if (!parsed.success) return null;

    for (const [index, occurrence] of parsed.data.entries()) {
      const arenaNumber = occurrence.arenaName.match(/^Arena (\d+)$/)?.[1];
      if (
        occurrence.arenaName !== "First Available" &&
        (!arenaNumber || Number(arenaNumber) > arenaCount)
      )
        return null;
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
            (previous) =>
              previous.scheduledDate === occurrence.scheduledDate &&
              previous.arenaName === occurrence.arenaName,
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
    return parsed.data.map((occurrence) => ({
      ...occurrence,
      arenaName: formatProperNoun(occurrence.arenaName),
    }));
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

  const classOccurrences = getClassOccurrences(
    formData,
    parsed.data.arenaCount,
  );
  if (!classOccurrences)
    return {
      errors: {
        classOccurrences: [
          "Check each scheduled roping's date, time, arena, order, and incentive settings.",
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

  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer")
    return { message: "You do not have permission to create events." };

  const supabase = await createClient();
  const templateIds = [
    ...new Set(classOccurrences.map(({ templateId }) => templateId)),
  ];
  const { data: templateSettings, error: templateSettingsError } =
    await supabase
      .from("roping_templates")
      .select(
        "id, main_round_count, cattle_draw_enabled, competition_format, handicap_rules",
      )
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .in("id", templateIds);
  if (templateSettingsError) return { message: templateSettingsError.message };
  if (templateSettings?.length !== templateIds.length)
    return {
      message: "One or more selected roping templates are no longer available.",
    };

  const settingsByTemplate = new Map(
    templateSettings.map((template) => [template.id, template]),
  );
  const standaloneClassificationIds = [
    ...new Set(
      classOccurrences
        .filter(
          (occurrence) =>
            settingsByTemplate.get(occurrence.templateId)
              ?.competition_format !== "handicap",
        )
        .map((occurrence) => occurrence.classificationId)
        .filter(Boolean),
    ),
  ];
  const { data: standaloneClassifications, error: standaloneError } =
    standaloneClassificationIds.length
      ? await supabase
          .from("classifications")
          .select("id")
          .eq("producer_id", producer.id)
          .eq("is_active", true)
          .eq("standalone_enabled", true)
          .in("id", standaloneClassificationIds)
      : { data: [], error: null };
  if (standaloneError) return { message: standaloneError.message };
  if (standaloneClassifications.length !== standaloneClassificationIds.length)
    return {
      message:
        "One or more selected classifications cannot have a standalone roping.",
    };
  const handicapClassificationIds = [
    ...new Set(
      templateSettings.flatMap((template) =>
        template.competition_format === "handicap"
          ? (
              (template.handicap_rules ?? []) as Array<{
                classificationId: string;
              }>
            ).map((rule) => rule.classificationId)
          : [],
      ),
    ),
  ];
  const { data: handicapClassifications, error: handicapError } =
    handicapClassificationIds.length
      ? await supabase
          .from("classifications")
          .select("id, handicap_time_credit_seconds:handicap_adjustment_seconds")
          .eq("producer_id", producer.id)
          .eq("is_active", true)
          .in("id", handicapClassificationIds)
      : { data: [], error: null };
  if (handicapError) return { message: handicapError.message };
  const handicapAdjustments = new Map(
    handicapClassifications.map((classification) => [
      classification.id,
      classification.handicap_time_credit_seconds === null
        ? null
        : Number(classification.handicap_time_credit_seconds),
    ]),
  );
  const configuredOccurrences = classOccurrences.map((occurrence) => {
    const template = settingsByTemplate.get(occurrence.templateId)!;
    const selectedHandicapIds = (
      (template.handicap_rules ?? []) as Array<{ classificationId: string }>
    ).map((rule) => rule.classificationId);
    return {
      ...occurrence,
      roundCount: template.main_round_count,
      cattleDrawEnabled: template.cattle_draw_enabled,
      incentiveEnabled:
        template.competition_format === "handicap"
          ? true
          : occurrence.incentiveEnabled,
      incentiveRules:
        template.competition_format === "handicap"
          ? selectedHandicapIds.map((classificationId) => ({
              classificationId,
              adjustmentSeconds: handicapAdjustments.get(classificationId)!,
            }))
          : occurrence.incentiveRules.map((rule) => ({
              ...rule,
              adjustmentSeconds: -rule.adjustmentSeconds,
            })),
    };
  });
  if (
    configuredOccurrences.some((occurrence) =>
      occurrence.incentiveRules.some(
        (rule) =>
          rule.adjustmentSeconds === null ||
          rule.adjustmentSeconds === undefined,
      ),
    )
  )
    return {
      message:
        "One or more Handicap classifications no longer have a time adjustment.",
    };

  const requiresQualification = formData.get("requiresQualification") === "on";
  const qualificationRuleSetId = requiresQualification ? String(formData.get("qualificationRuleSetId") ?? "") : null;
  if (requiresQualification && !z.uuid().safeParse(qualificationRuleSetId).success) return { message: "Choose a qualification rule set." };
  const eventSetup = {
      event_title: parsed.data.title,
      event_slug: parsed.data.slug,
      event_venue_name: parsed.data.venueName,
      event_address: parsed.data.address,
      event_city: parsed.data.city,
      event_state: parsed.data.state,
      event_postal_code: parsed.data.postalCode,
      event_starts_at_local: parsed.data.startsAt,
      event_ends_at_local: parsed.data.endsAt || null,
      event_entries_open_at_local: parsed.data.entriesOpenAt || null,
      event_entries_close_at_local: parsed.data.entriesCloseAt || null,
      event_publication_state: parsed.data.publicationState,
      event_class_occurrences: configuredOccurrences,
      event_short_round_enabled: false,
      event_short_round_brackets: [],
      event_short_round_tie_policy: "advance_all",
      event_fee_title: parsed.data.eventFeeTitle,
      event_fee_amount_cents: parsed.data.eventFeeAmount
        ? Math.round(Number(parsed.data.eventFeeAmount) * 100)
        : null,
      arena_count: parsed.data.arenaCount,
  };
  const { data: newRopingId, error } = await supabase.rpc("create_event_with_qualification", {
    target_producer_id: producer.id, event_setup: eventSetup, target_rule_set_id: qualificationRuleSetId,
  });

  if (error)
    return {
      message:
        error.code === "23505"
          ? "An event already uses that public URL."
          : error.message,
    };

  const qualificationError = requiresQualification ? await refreshEventQualificationChecks(newRopingId) : null;

  revalidatePath("/events");
  return {
    success: true,
    message: qualificationError ? `Event created. Qualification needs a manager refresh before entries can be accepted: ${qualificationError}` : "Event created with its scheduled ropings, fees, and options.",
  };
}
