"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganization } from "@/lib/organizations";
import { formatProperNoun } from "@/lib/utils";

export interface LiveRunState {
  success?: boolean;
  message?: string;
}

export type DrawOrderState = LiveRunState;
export type ScheduleFormState = LiveRunState;
export type CattleFormState = LiveRunState;
export type EventDayFormState = LiveRunState;
export type EventScheduleFormState = LiveRunState;
export interface EventDetailsFormState extends LiveRunState {
  errors?: Record<string, string[]>;
}

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid date and time.");

const eventDetailsSchema = z.object({
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
  eventFeeId: z.union([z.literal(""), z.uuid()]),
  eventFeeTitle: z.string().trim().transform(formatProperNoun),
  eventFeeAmount: z.union([
    z.literal(""),
    z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a valid amount."),
  ]),
  publicationState: z.enum(["draft", "published", "unpublished"]),
});

async function requireManager() {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    throw new Error("Manager access is required.");
  return createClient();
}

export async function updateEventDetails(
  ropingId: string,
  _state: EventDetailsFormState,
  formData: FormData,
): Promise<EventDetailsFormState> {
  const parsed = eventDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (parsed.data.endsAt && parsed.data.endsAt < parsed.data.startsAt)
    return { errors: { endsAt: ["The event end must be after its start."] } };
  if (
    parsed.data.entriesOpenAt &&
    parsed.data.entriesCloseAt &&
    parsed.data.entriesCloseAt < parsed.data.entriesOpenAt
  )
    return {
      errors: {
        entriesCloseAt: ["Entries must close after they open."],
      },
    };
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

  const supabase = await requireManager();
  const { data: arenaAssignments, error: arenaAssignmentsError } =
    await supabase
      .from("roping_divisions")
      .select("arena_name")
      .eq("roping_id", ropingId);
  if (arenaAssignmentsError) return { message: arenaAssignmentsError.message };

  const invalidArena = arenaAssignments?.find((assignment) => {
    const arenaNumber = assignment.arena_name?.match(/^Arena (\d+)$/)?.[1];
    return arenaNumber && Number(arenaNumber) > parsed.data.arenaCount;
  });
  if (invalidArena)
    return {
      errors: {
        arenaCount: [
          `Move ropings out of ${invalidArena.arena_name} before reducing the number of arenas.`,
        ],
      },
    };

  const { error } = await supabase.rpc("update_event_details", {
    target_roping_id: ropingId,
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
    event_fee_id: parsed.data.eventFeeId || null,
    event_fee_title: parsed.data.eventFeeTitle,
    event_fee_amount_cents: parsed.data.eventFeeAmount
      ? Math.round(Number(parsed.data.eventFeeAmount) * 100)
      : null,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "Another event already uses that public URL."
          : error.message,
    };

  const { error: arenaError } = await supabase.rpc("set_event_arena_count", {
    target_roping_id: ropingId,
    new_arena_count: parsed.data.arenaCount,
  });
  if (arenaError) return { message: arenaError.message };

  revalidatePath("/ropings");
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/public`);
  return { success: true, message: "Event details saved." };
}

const addEventRopingSchema = z.object({
  templateId: z.uuid(),
  classificationId: z.union([z.literal(""), z.uuid()]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleType: z.enum(["fixed", "tentative", "follows_previous"]),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .or(z.literal("")),
  scheduleNote: z.string().trim().max(120),
  arenaName: z.string().trim().min(1).max(80).transform(formatProperNoun),
});

export async function addRopingToEvent(
  ropingId: string,
  _state: EventScheduleFormState,
  formData: FormData,
): Promise<EventScheduleFormState> {
  const parsed = addEventRopingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      message: parsed.error.issues[0]?.message ?? "Check the roping setup.",
    };
  if (parsed.data.scheduleType !== "follows_previous" && !parsed.data.startTime)
    return { message: "Set and tentative schedules require a start time." };
  const supabase = await requireManager();
  const [{ data: event }, { data: previousRopings }, { data: template }] =
    await Promise.all([
      supabase
        .from("ropings")
        .select("arena_count")
        .eq("id", ropingId)
        .single(),
      supabase
        .from("roping_divisions")
        .select("id")
        .eq("roping_id", ropingId)
        .eq("scheduled_date", parsed.data.scheduledDate)
        .eq("arena_name", parsed.data.arenaName)
        .limit(1),
      supabase
        .from("division_templates")
        .select("number_of_runs, cattle_draw_enabled")
        .eq("id", parsed.data.templateId)
        .eq("is_active", true)
        .single(),
    ]);
  if (!template) return { message: "That roping template is unavailable." };
  const arenaNumber = parsed.data.arenaName.match(/^Arena (\d+)$/)?.[1];
  if (
    parsed.data.arenaName !== "First Available" &&
    (!arenaNumber || Number(arenaNumber) > (event?.arena_count ?? 0))
  )
    return { message: "Choose an arena configured for this event." };
  if (
    parsed.data.scheduleType === "follows_previous" &&
    !previousRopings?.length
  )
    return {
      message:
        "Choose an earlier roping in the same arena before using follows.",
    };
  const { error } = await supabase.rpc("add_roping_to_event", {
    target_roping_id: ropingId,
    target_template_id: parsed.data.templateId,
    target_classification_id: parsed.data.classificationId || null,
    target_scheduled_date: parsed.data.scheduledDate,
    target_schedule_type: parsed.data.scheduleType,
    target_starts_at_local:
      parsed.data.scheduleType === "follows_previous"
        ? null
        : `${parsed.data.scheduledDate}T${parsed.data.startTime}:00`,
    target_schedule_note: parsed.data.scheduleNote,
    target_arena_name: parsed.data.arenaName,
    target_round_count: template.number_of_runs,
    target_cattle_draw_enabled: template.cattle_draw_enabled,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath("/public");
  return { success: true, message: "Roping added to the event." };
}

const removeEventRopingSchema = z.object({
  reason: z.string().trim().min(5, "Enter a brief removal reason.").max(300),
});

export async function removeRopingFromEvent(
  ropingId: string,
  divisionId: string,
  _state: EventScheduleFormState,
  formData: FormData,
): Promise<EventScheduleFormState> {
  const parsed = removeEventRopingSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return { message: parsed.error.issues[0]?.message };
  const supabase = await requireManager();
  const { data, error } = await supabase.rpc("remove_roping_from_event", {
    target_roping_division_id: divisionId,
    removal_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/ropings/${ropingId}/payouts`);
  revalidatePath("/public");
  return {
    success: true,
    message: `Roping removed${data ? ` with ${data} ${data === 1 ? "entry" : "entries"}` : ""}.`,
  };
}

const entrySpacingSchema = z.object({
  divisionId: z.uuid(),
  minimumRunsBetweenEntries: z.coerce.number().int().min(0).max(100),
});

const roundOrderMethodSchema = z.enum([
  "reverse_first",
  "aggregate_slowest_to_fastest",
  "custom",
]);

const roundOrderingSchema = z.object({
  divisionId: z.uuid(),
  secondRoundOrdering: roundOrderMethodSchema,
  laterRoundOrdering: roundOrderMethodSchema,
});

export async function updateClassEntrySpacing(
  ropingId: string,
  formData: FormData,
) {
  const parsed = entrySpacingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    throw new Error("Entry spacing must be between 0 and 100 runs.");
  const supabase = await requireManager();
  const { error } = await supabase.rpc("set_division_entry_spacing", {
    target_roping_division_id: parsed.data.divisionId,
    new_minimum_runs: parsed.data.minimumRunsBetweenEntries,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}

export async function updateClassRoundOrdering(
  ropingId: string,
  formData: FormData,
) {
  const parsed = roundOrderingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Choose valid round ordering rules.");
  const supabase = await requireManager();
  const { error } = await supabase.rpc("set_division_round_ordering", {
    target_roping_division_id: parsed.data.divisionId,
    new_second_round_ordering: parsed.data.secondRoundOrdering,
    new_later_round_ordering: parsed.data.laterRoundOrdering,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}

export async function saveEventCattle(
  ropingId: string,
  _state: CattleFormState,
  formData: FormData,
): Promise<CattleFormState> {
  const tags = String(formData.get("cattleTags") ?? "")
    .split(/[\n,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.some((tag) => tag.length > 40))
    return { message: "Keep each cattle number under 40 characters." };

  const supabase = await requireManager();
  const { data, error } = await supabase.rpc("save_event_cattle", {
    target_roping_id: ropingId,
    cattle_tags: tags,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "animal is" : "animals are"} active for this event.`,
  };
}

export async function drawRoundCattle(
  ropingId: string,
  _state: CattleFormState,
  formData: FormData,
): Promise<CattleFormState> {
  const parsed = z
    .object({
      divisionId: z.uuid(),
      runNumber: z.coerce.number().int().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Choose a valid class and round." };

  const supabase = await requireManager();
  const { data, error } = await supabase.rpc("draw_round_cattle", {
    target_roping_division_id: parsed.data.divisionId,
    target_run_number: parsed.data.runNumber,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "run" : "runs"} received a cattle draw.`,
  };
}

const eventDaySchema = z.object({
  arenaName: z.string().trim().min(1).max(80).transform(formatProperNoun),
  eventDayStatus: z.enum([
    "scheduled",
    "delayed",
    "holding",
    "in_progress",
    "completed",
  ]),
  estimatedStart: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  ]),
  eventDayNote: z.string().trim().max(180),
});

export async function updateClassEventDayStatus(
  ropingId: string,
  divisionId: string,
  _state: EventDayFormState,
  formData: FormData,
): Promise<EventDayFormState> {
  const parsed = eventDaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { message: "Check the arena, status, expected start, and note." };

  const supabase = await requireManager();
  const { data: division } = await supabase
    .from("roping_divisions")
    .select(
      "schedule_type, scheduled_date, sort_order, ropings!inner(arena_count)",
    )
    .eq("id", divisionId)
    .single();
  const event = division?.ropings as unknown as { arena_count: number } | null;
  const arenaNumber = parsed.data.arenaName.match(/^Arena (\d+)$/)?.[1];
  if (
    parsed.data.arenaName !== "First Available" &&
    (!arenaNumber || Number(arenaNumber) > (event?.arena_count ?? 0))
  )
    return { message: "Choose an arena configured for this event." };
  if (division?.schedule_type === "follows_previous") {
    const { count } = await supabase
      .from("roping_divisions")
      .select("id", { count: "exact", head: true })
      .eq("roping_id", ropingId)
      .eq("scheduled_date", division.scheduled_date)
      .eq("arena_name", parsed.data.arenaName)
      .lt("sort_order", division.sort_order);
    if (!count)
      return {
        message: "A follows roping needs an earlier roping in the same arena.",
      };
  }
  const { error } = await supabase.rpc("update_class_event_day_status", {
    target_roping_division_id: divisionId,
    new_arena_name: parsed.data.arenaName,
    new_event_day_status: parsed.data.eventDayStatus,
    new_estimated_starts_at_local: parsed.data.estimatedStart || null,
    new_event_day_note: parsed.data.eventDayNote,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath("/public");
  return { success: true, message: "Live schedule update published." };
}

const scheduleSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleType: z.enum(["fixed", "tentative", "follows_previous"]),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .or(z.literal("")),
  scheduleNote: z.string().trim().max(120),
});

export async function updateClassSchedule(
  ropingId: string,
  divisionId: string,
  _state: ScheduleFormState,
  formData: FormData,
): Promise<ScheduleFormState> {
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { message: "Choose a valid date and schedule listing." };
  if (parsed.data.scheduleType !== "follows_previous" && !parsed.data.startTime)
    return { message: "Set and tentative schedules require a time." };

  const supabase = await requireManager();
  if (parsed.data.scheduleType === "follows_previous") {
    const { data: division } = await supabase
      .from("roping_divisions")
      .select("arena_name, sort_order")
      .eq("id", divisionId)
      .single();
    if (!division) return { message: "That roping is unavailable." };
    const { count } = await supabase
      .from("roping_divisions")
      .select("id", { count: "exact", head: true })
      .eq("roping_id", ropingId)
      .eq("scheduled_date", parsed.data.scheduledDate)
      .eq("arena_name", division.arena_name)
      .lt("sort_order", division.sort_order);
    if (!count)
      return {
        message: "A follows roping needs an earlier roping in the same arena.",
      };
  }
  const { error } = await supabase.rpc("save_class_schedule", {
    target_roping_division_id: divisionId,
    target_scheduled_date: parsed.data.scheduledDate,
    target_schedule_type: parsed.data.scheduleType,
    target_starts_at_local:
      parsed.data.scheduleType === "follows_previous"
        ? null
        : `${parsed.data.scheduledDate}T${parsed.data.startTime}:00`,
    target_schedule_note: parsed.data.scheduleNote,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/public`);
  return { success: true, message: "Schedule updated." };
}

export async function startRoping(ropingId: string) {
  const supabase = await requireManager();
  const { error } = await supabase.rpc("set_roping_in_progress", {
    target_roping_id: ropingId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}

export async function generateDraw(ropingId: string, formData: FormData) {
  const parsed = z
    .object({ divisionId: z.uuid(), runNumber: z.coerce.number().int().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Choose a valid class and round.");
  const supabase = await requireManager();
  const { error } = await supabase.rpc("generate_division_draw", {
    target_roping_division_id: parsed.data.divisionId,
    target_run_number: parsed.data.runNumber,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}/live`);
}

export async function saveDrawOrder(
  ropingId: string,
  _state: DrawOrderState,
  formData: FormData,
): Promise<DrawOrderState> {
  const parsed = z
    .object({ divisionId: z.uuid(), runNumber: z.coerce.number().int().min(1) })
    .safeParse(Object.fromEntries(formData));
  const runIds = formData.getAll("runIds").map(String);
  if (
    !parsed.success ||
    !runIds.length ||
    runIds.some((runId) => !z.uuid().safeParse(runId).success)
  )
    return { message: "The draw order is incomplete or invalid." };

  const supabase = await requireManager();
  const { data, error } = await supabase.rpc("set_division_draw_order", {
    target_roping_division_id: parsed.data.divisionId,
    target_run_number: parsed.data.runNumber,
    ordered_run_ids: runIds,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "run" : "runs"} reordered.`,
  };
}

export async function seedShortRound(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const divisionId = z.uuid().safeParse(formData.get("divisionId"));
  if (!divisionId.success) return { message: "Choose a valid class." };
  const supabase = await requireManager();
  const { data, error } = await supabase.rpc("seed_short_round", {
    target_roping_division_id: divisionId.data,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "entry" : "entries"} advanced to the short round.`,
  };
}

const shortRoundFieldChangeSchema = z.object({
  entryId: z.uuid(),
  fieldAction: z.enum(["added", "removed"]),
  reason: z.string().trim().min(5).max(300),
});

export async function changeShortRoundQualifier(
  ropingId: string,
  divisionId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = shortRoundFieldChangeSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success)
    return { message: "Choose a contestant and enter a brief reason." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("manage_short_round_qualifier", {
    target_roping_division_id: divisionId,
    target_entry_id: parsed.data.entryId,
    field_action: parsed.data.fieldAction,
    change_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath("/public");
  return {
    success: true,
    message:
      parsed.data.fieldAction === "added"
        ? "Finalist added and the short-round order rebuilt."
        : "Finalist removed and the short-round order rebuilt.",
  };
}

export async function lockShortRoundField(
  ropingId: string,
  divisionId: string,
  _state: LiveRunState,
  _formData: FormData,
): Promise<LiveRunState> {
  void _state;
  void _formData;
  const supabase = await requireManager();
  const { error } = await supabase.rpc("lock_short_round_field", {
    target_roping_division_id: divisionId,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath("/public");
  return { success: true, message: "Short round field locked." };
}

const runSchema = z.object({
  runId: z.uuid(),
  penalty: z.coerce.number().min(0).max(999),
  status: z.enum([
    "complete",
    "no_time",
    "disqualified",
    "scratch",
    "turned_out",
    "rerun",
  ]),
});

const correctionSchema = runSchema.extend({
  reason: z.string().trim().min(5).max(300),
});

const rerunScheduleSchema = z.object({
  runId: z.uuid(),
  timing: z.enum(["immediate", "end_of_round"]),
  reason: z.string().trim().min(5).max(300),
});

function getTimerReadings(formData: FormData, status: string) {
  const timerValues = formData.getAll("timerReading").map(String);
  const timerReadings = timerValues.map(Number);
  const valid =
    status !== "complete" ||
    (timerValues.length > 0 &&
      timerValues.every((value) => /^\d+(?:\.\d{1,3})?$/.test(value)) &&
      timerReadings.every((value) => value >= 0));
  return { timerReadings, valid };
}

export async function recordRun(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = runSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { message: "Enter a valid time before saving this run." };
  const { timerReadings, valid } = getTimerReadings(
    formData,
    parsed.data.status,
  );
  if (!valid) return { message: "Enter a valid reading from every timer." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("record_run_result_multi", {
    target_run_id: parsed.data.runId,
    entered_timer_readings:
      parsed.data.status === "complete" ? timerReadings : [],
    entered_penalty: parsed.data.penalty,
    entered_status: parsed.data.status,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/ropings/${ropingId}/payouts`);
  revalidatePath(`/public`);
  return { success: true, message: "Run saved." };
}

export async function correctRun(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      message: "Choose an outcome and enter a brief correction reason.",
    };
  const { timerReadings, valid } = getTimerReadings(
    formData,
    parsed.data.status,
  );
  if (!valid) return { message: "Enter a valid reading from every timer." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("correct_run_result_multi", {
    target_run_id: parsed.data.runId,
    entered_timer_readings:
      parsed.data.status === "complete" ? timerReadings : [],
    entered_penalty: parsed.data.penalty,
    entered_status: parsed.data.status,
    entered_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/ropings/${ropingId}/payouts`);
  revalidatePath(`/public`);
  return { success: true, message: "Correction saved and added to the log." };
}

export async function scheduleRerun(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = rerunScheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { message: "Choose when to run again and enter a brief reason." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("schedule_run_rerun", {
    target_run_id: parsed.data.runId,
    target_timing: parsed.data.timing,
    entered_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/ropings/${ropingId}/payouts`);
  revalidatePath(`/public`);
  return {
    success: true,
    message:
      parsed.data.timing === "immediate"
        ? "Rerun is next in the arena queue."
        : "Rerun moved to the end of this round.",
  };
}

export async function completeRound(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = z
    .object({
      divisionId: z.uuid(),
      runNumber: z.coerce.number().int().min(1),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Choose a valid round." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("complete_roping_round", {
    target_roping_division_id: parsed.data.divisionId,
    target_run_number: parsed.data.runNumber,
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  return { success: true, message: "Round completed and locked." };
}

export async function finalizeRoping(ropingId: string): Promise<void> {
  const supabase = await requireManager();
  const { error } = await supabase.rpc("finalize_roping_results", {
    target_roping_id: ropingId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}
