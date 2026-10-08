"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function withdrawOnlineEntryRequest(_state: { message?: string; success?: boolean }, form: FormData): Promise<{ message?: string; success?: boolean }> {
  const parsed = z.object({ requestId: z.uuid(), revision: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Reload this request before withdrawing." };
  const db = await createClient();
  const { error } = await db.rpc("withdraw_my_online_entry", { target_submission_id: parsed.data.requestId, expected_revision: parsed.data.revision });
  if (error) return { message: error.message };
  revalidatePath("/roper");
  revalidatePath("/roper/requests");
  revalidatePath("/events", "layout");
  return { success: true, message: "Request withdrawn. No entries or charges were created." };
}
