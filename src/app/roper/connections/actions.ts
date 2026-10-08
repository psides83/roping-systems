"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function requestConnection(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_membership_link", {
    producer_slug: String(form.get("producer") ?? ""),
    requested_number: String(form.get("number") ?? ""),
    requested_name: String(form.get("name") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath("/roper/connections");
  return { success: "Request sent. The producer will verify your identity before connecting your membership." };
}
