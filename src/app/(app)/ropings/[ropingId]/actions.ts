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
  if (!parsed.success) throw new Error("Choose a valid entry class and round.");
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

const runSchema = z.object({
  runId: z.uuid(),
  penalty: z.coerce.number().min(0).max(999),
  status: z.enum(["complete", "no_time", "scratch", "rerun"]),
});

export async function recordRun(
  ropingId: string,
  _state: LiveRunState,
  formData: FormData,
): Promise<LiveRunState> {
  const parsed = runSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { message: "Enter a valid time before saving this run." };
  const timerValues = formData.getAll("timerReading").map(String);
  const timerReadings = timerValues.map(Number);
  if (
    parsed.data.status === "complete" &&
    (!timerValues.length ||
      timerValues.some((value) => !/^\d+(?:\.\d{1,3})?$/.test(value)) ||
      timerReadings.some((value) => value < 0))
  )
    return { message: "Enter a valid reading from every timer." };

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
  revalidatePath(`/public`);
  return { success: true, message: "Run saved." };
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
