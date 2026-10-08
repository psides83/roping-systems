"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roperContactSchema } from "@/lib/roper-profile";
export interface ProfileState { error?: string; success?: string }
export async function saveContact(_state: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = roperContactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_member_contact", { target_membership: p.membership,
    contact_email: p.email, contact_phone: p.phone, contact_city: p.city, contact_state: p.state,
    profile_revision: p.profileRevision, membership_revision: p.membershipRevision });
  if (error) return { error: error.message };
  revalidatePath("/roper/profile"); revalidatePath("/members"); revalidatePath("/public", "layout");
  return { success: "Contact details saved." };
}
export async function requestCorrection(_state: ProfileState, form: FormData): Promise<ProfileState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_member_profile_correction", {
    target_membership: String(form.get("membership") ?? ""), new_birth_date: String(form.get("birthDate") ?? "") || null,
    new_gender: String(form.get("gender") ?? "") || null, request_reason: String(form.get("reason") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath("/roper/profile"); revalidatePath("/members/profile-requests");
  return { success: "Correction sent to the producer for review." };
}
