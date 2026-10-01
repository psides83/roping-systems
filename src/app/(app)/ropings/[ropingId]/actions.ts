"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganization } from "@/lib/organizations";

export interface LiveRunState {
  success?: boolean;
  message?: string;
}

export type DrawOrderState = LiveRunState;
export type ScheduleFormState = LiveRunState;

const shortRoundBracketSchema = z
  .array(
    z.object({
      minimumEntries: z.number().int().min(1),
      maximumEntries: z.number().int().min(1).nullable(),
      comebackCount: z.number().int().min(1),
    }),
  )
  .min(1);

async function requireManager() {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    throw new Error("Manager access is required.");
  return createClient();
}

const roundCountSchema = z.object({
  divisionId: z.union([z.literal(""), z.uuid()]),
  roundCount: z.coerce.number().int().min(1).max(20),
});

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

export async function updateRopingRounds(ropingId: string, formData: FormData) {
  const parsed = roundCountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Round count must be between 1 and 20.");
  const supabase = await requireManager();
  const { error } = await supabase.rpc("set_roping_round_count", {
    target_roping_id: ropingId,
    new_round_count: parsed.data.roundCount,
    target_roping_division_id: parsed.data.divisionId || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}

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

export async function saveShortRoundSettings(
  ropingId: string,
  divisionId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const enabled = formData.get("shortRoundEnabled") === "on";
  let brackets: z.infer<typeof shortRoundBracketSchema> = [];
  try {
    const parsed = shortRoundBracketSchema.safeParse(
      JSON.parse(String(formData.get("shortRoundBrackets") ?? "[]")),
    );
    if (enabled && !parsed.success)
      return { message: "Add at least one valid comeback entry range." };
    if (parsed.success) brackets = parsed.data;
  } catch {
    return { message: "The comeback schedule is invalid." };
  }

  const supabase = await requireManager();
  const { error } = await supabase.rpc("save_short_round_settings", {
    target_roping_division_id: divisionId,
    short_round_is_enabled: enabled,
    short_round_brackets: enabled ? brackets : [],
  });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message: enabled ? "Short round settings saved." : "Short round disabled.",
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
