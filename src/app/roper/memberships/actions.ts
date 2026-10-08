"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function claimMembershipApplication(_state: { error?: string; success?: boolean }, form: FormData): Promise<{ error?: string; success?: boolean }> {
  const code = z.string().regex(/^[0-9a-f-]{36}\.[0-9a-f]{64}$/).safeParse(form.get("receiptCode"));
  if (!code.success) return { error: "Enter the complete private receipt code from your application." };
  const [id, token] = code.data.split(".");
  if (!z.uuid().safeParse(id).success) return { error: "Check your receipt code." };
  const db = await createClient();
  const { error } = await db.rpc("claim_membership_application", { target_application: id, receipt_token: token });
  if (error) return { error: error.message };
  revalidatePath("/roper"); revalidatePath("/roper/memberships"); revalidatePath("/roper/connections");
  revalidatePath("/settings/membership-form");
  return { success: true };
}
