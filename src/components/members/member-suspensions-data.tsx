import { createClient } from "@/lib/supabase/server";
import { MemberSuspensions } from "./member-suspensions";
import type { MembershipSuspension } from "@/lib/membership-suspensions";

export async function MemberSuspensionsData({ membershipId, canManage }: { membershipId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("membership_suspensions")
    .select("id, starts_on, ends_on, reason, created_at, staff_label, lifted_at, lifted_by_label, lift_reason")
    .eq("membership_id", membershipId).order("starts_on", { ascending: false });
  if (error) throw new Error(`Unable to load suspensions: ${error.message}`);
  const { data: membership, error: membershipError } = await supabase.rpc("membership_suspension_calendar", { target_membership_id: membershipId });
  if (membershipError || !membership?.length) throw new Error("Unable to load the producer calendar.");
  return <MemberSuspensions membershipId={membershipId} suspensions={(data ?? []) as MembershipSuspension[]}
    canManage={canManage} today={membership[0].today} />;
}
