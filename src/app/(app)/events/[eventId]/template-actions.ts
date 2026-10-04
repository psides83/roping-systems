"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export interface TemplateUpdateState { success?: boolean; message?: string }

export async function confirmTemplateUpdate(eventId: string, ropingId: string, _state: TemplateUpdateState, formData: FormData): Promise<TemplateUpdateState> {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/), decision: z.enum(["update", "keep"]), confirmEntries: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || !z.uuid().safeParse(eventId).success || !z.uuid().safeParse(ropingId).success) return { message: "Refresh this page and review the changes again." };
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { message: "Manager access is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_event_roping_template_update", {
    target_producer_id: producer.id, target_event_id: eventId, target_roping_id: ropingId,
    expected_review_token: parsed.data.token, keep_current: parsed.data.decision === "keep",
    confirm_entry_changes: parsed.data.confirmEntries === "on",
  });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  revalidatePath(`/events/${eventId}/payouts`);
  revalidatePath("/public", "layout");
  return { success: true };
}
