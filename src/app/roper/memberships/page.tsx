import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembershipApplications } from "@/components/roper/membership-applications";
import type { PortalMembership } from "@/lib/roper-portal";
import type { PortalMembershipApplications } from "@/lib/roper-memberships";
export default async function MembershipsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: portal, error } = await supabase.rpc("my_roper_portal");
  const { data: applications, error: applicationError } = await supabase.rpc("my_membership_applications");
  if (error || applicationError) throw new Error("Unable to load membership applications.");
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-7"><Link href="/roper" className="text-sm font-semibold">Back to portal</Link><h1 className="text-2xl font-bold">Membership applications</h1><MembershipApplications data={applications as PortalMembershipApplications} memberships={(portal?.memberships ?? []) as PortalMembership[]} /></main>;
}
