"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { validSuspensionDates } from "@/lib/membership-suspensions";

export async function saveMembershipSuspension(membershipId: string, suspensionId: string | null, reference: string, form: FormData) {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "You do not have permission to manage suspensions." };
  const supabase = await createClient();
  const { data: member } = await supabase.from("memberships").select("id").eq("id", membershipId).eq("producer_id", producer.id).single();
  if (!member) return { error: "Member not found." };
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 5 || reason.length > 2000) return { error: "Provide a clearly explained reason (5-2,000 characters)." };
  let result;
  if (suspensionId) {
    const { data: suspension } = await supabase.from("membership_suspensions").select("id")
      .eq("id", suspensionId).eq("membership_id", membershipId).eq("producer_id", producer.id).single();
    if (!suspension) return { error: "Suspension not found." };
    result = await supabase.rpc("lift_membership_suspension", { target_suspension_id: suspensionId, target_reason: reason });
  } else {
    const start = String(form.get("startsOn") ?? "");
    const end = String(form.get("endsOn") ?? "");
    if (!validSuspensionDates(start, end)) return { error: "Choose valid dates, with the end on or after the start." };
    result = await supabase.rpc("issue_membership_suspension", {
      target_membership_id: membershipId, target_suspension_id: reference,
      target_starts_on: start, target_ends_on: end, target_reason: reason,
    });
  }
  if (result.error) return { error: result.error.message };
  revalidatePath("/", "layout");
  return { success: true };
}
