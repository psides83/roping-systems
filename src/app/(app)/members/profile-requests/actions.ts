"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function reviewProfile(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_member_profile_correction", {
    request_id: String(form.get("id") ?? ""), decision: String(form.get("decision") ?? ""), decision_reason: String(form.get("reason") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath("/members/profile-requests"); revalidatePath("/members"); revalidatePath("/roper/profile");
  return { success: "Correction reviewed." };
}
