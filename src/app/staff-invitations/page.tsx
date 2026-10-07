import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AcceptStaffInvitation } from "@/components/settings/accept-staff-invitation";
export default async function StaffInvitationsPage() {
  const db = await createClient();
  const {data} = await db.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const invitations = await db.rpc("my_staff_invitations");
  if (invitations.error) throw new Error("Unable to load staff invitations.");
  return <main className="mx-auto max-w-2xl px-5 py-10"><h1 className="text-2xl font-bold">Staff invitations</h1>
    <p className="mt-2 break-all text-sm text-[#66716b]">{String(data.claims.email ?? "")}</p>
    <div className="mt-6 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{(invitations.data as {id:string;producer_name:string;role:string}[]).map((item) => <section key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h2 className="font-semibold">{item.producer_name}</h2><p className="mt-1 text-sm capitalize text-[#66716b]">{item.role}</p></div><AcceptStaffInvitation id={item.id} /></section>)}</div>
    {!invitations.data?.length ? <p className="mt-5 text-sm text-[#66716b]">No active invitations for your verified email.</p> : null}
    <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold underline">Continue to your account</Link>
  </main>;
}
