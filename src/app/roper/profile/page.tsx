import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PortalMembership } from "@/lib/roper-portal";
import type { RoperProfile } from "@/lib/roper-profile";
import { ProfileForm } from "@/components/roper/profile-form";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: portal, error } = await supabase.rpc("my_roper_portal");
  if (error) throw new Error("Unable to load memberships.");
  const memberships = (portal?.memberships ?? []) as PortalMembership[];
  const params = await searchParams;
  const member = memberships.find((m) => m.id === params.member) ?? memberships[0];
  if (!member) return <main className="mx-auto max-w-5xl space-y-4 px-5 py-7"><Link href="/roper">Back to portal</Link><h1 className="text-2xl font-bold">My profile</h1><p>Connect a membership before editing its profile.</p><Link href="/roper/connections">Connect a membership</Link></main>;
  const { data: profile, error: profileError } = await supabase.rpc("my_member_profile", { target_membership: member.id });
  if (profileError) throw new Error("Unable to load your profile.");
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-7"><Link href="/roper" className="text-sm font-semibold">Back to portal</Link><h1 className="text-2xl font-bold">My profile · {(profile as RoperProfile).name}</h1>
    <form className="flex flex-wrap items-end gap-2"><label className="flex max-w-full flex-col gap-1 text-sm font-semibold">Membership<select name="member" defaultValue={member.id} className="h-10 w-64 max-w-full rounded-md border px-3">{memberships.map((m) => <option key={m.id} value={m.id}>{m.producerName} · #{m.memberNumber}</option>)}</select></label><button className="h-10 rounded-md border px-3 text-sm font-semibold">View</button></form>
    <ProfileForm key={member.id} profile={profile as RoperProfile} />
  </main>;
}
