"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function reviewConnection(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_membership_link", {
    request_id: String(form.get("id") ?? ""), decision: String(form.get("decision") ?? ""),
    selected_membership: String(form.get("member") ?? "") || null,
    verification_reason: String(form.get("reason") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath("/members/account-links");
  revalidatePath("/roper");
  revalidatePath("/roper/connections");
  return { success: "Connection updated." };
}
