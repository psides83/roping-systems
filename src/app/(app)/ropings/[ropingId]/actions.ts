"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganization } from "@/lib/organizations";

export interface LiveRunState {
  success?: boolean;
  message?: string;
}

async function requireManager() {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") throw new Error("Manager access is required.");
  return createClient();
}

export async function startRoping(ropingId: string) {
  const supabase = await requireManager();
  const { error } = await supabase.rpc("set_roping_in_progress", { target_roping_id: ropingId });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}

export async function generateDraw(ropingId: string, formData: FormData) {
  const divisionId = String(formData.get("divisionId") ?? "");
  const runNumber = Number(formData.get("runNumber") ?? 1);
  const supabase = await requireManager();
  const { error } = await supabase.rpc("generate_division_draw", { target_roping_division_id: divisionId, target_run_number: runNumber });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}/live`);
}

const runSchema = z.object({
  runId: z.uuid(),
  rawTime: z.union([z.literal(""), z.string().regex(/^\d+(?:\.\d{1,3})?$/)]),
  penalty: z.coerce.number().min(0).max(999),
  status: z.enum(["complete", "no_time", "scratch", "rerun"]),
});

export async function recordRun(ropingId: string, _state: LiveRunState, formData: FormData): Promise<LiveRunState> {
  const parsed = runSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Enter a valid time before saving this run." };
  if (parsed.data.status === "complete" && !parsed.data.rawTime) return { message: "A completed run requires a time." };

  const supabase = await requireManager();
  const { error } = await supabase.rpc("record_run_result", { target_run_id: parsed.data.runId, entered_raw_time: parsed.data.rawTime ? Number(parsed.data.rawTime) : null, entered_penalty: parsed.data.penalty, entered_status: parsed.data.status });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/public`);
  return { success: true, message: "Run saved." };
}

export async function finalizeRoping(ropingId: string): Promise<void> {
  const supabase = await requireManager();
  const { error } = await supabase.rpc("finalize_roping_results", { target_roping_id: ropingId });
  if (error) throw new Error(error.message);
  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/live`);
}
