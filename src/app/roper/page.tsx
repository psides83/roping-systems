import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MemberFinesData } from "@/components/members/member-fines-data";
import { MemberSuspensionsData } from "@/components/members/member-suspensions-data";
import { signOut } from "@/app/auth/actions";

export default async function RoperPortal() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: memberships, error } = await supabase.rpc("my_memberships");
  if (error) throw new Error(`Unable to load your memberships: ${error.message}`);
  return <main className="min-h-screen bg-[#f5f6f7] text-[#19231d]">
    <header className="border-b border-[#dfe4e1] bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4"><Link href="/" className="font-bold">Roping Systems</Link><form action={signOut}><button className="h-9 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">Sign out</button></form></div></header>
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7"><h1 className="flex items-center gap-2 text-2xl font-bold"><UserRound size={24} />Roper portal</h1>
      {(memberships ?? []).map((membership: { id: string; member_number: string; producer_name: string }) => <section key={membership.id} className="space-y-5 border-t border-[#dfe4e1] pt-5"><header><h2 className="text-xl font-bold">{membership.producer_name}</h2><p className="mt-1 text-sm text-[#66716b]">Member #{membership.member_number}</p></header><MemberSuspensionsData membershipId={membership.id} canManage={false} /><MemberFinesData membershipId={membership.id} canManage={false} /></section>)}
      {!memberships?.length ? <p className="text-sm text-[#66716b]">No producer memberships are linked to your account yet. Contact your producer to check the email address on your member record.</p> : null}
    </div>
  </main>;
}
