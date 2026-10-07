import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcceptStaffInvitation } from "@/components/settings/accept-staff-invitation";
export default async function StaffInvitationsPage() {
  const db = await createClient();
  const {data} = await db.auth.getClaims();
  if (!data?.claims) return <main className="mx-auto max-w-md px-5 py-12">
    <h1 className="text-2xl font-bold">Accept your staff invitation</h1>
    <p className="mt-3 text-sm leading-6 text-[#66716b]">Sign in using the email address your producer invited. Your invitation will be shown after sign-in.</p>
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/auth/login?next=%2Fstaff-invitations" className="rounded-md brand-accent-fill px-4 py-3 text-sm font-bold text-white">Sign in</Link>
      <Link href="/auth/signup?next=%2Fstaff-invitations" className="rounded-md border border-[#ccd4d0] px-4 py-3 text-sm font-semibold">Create account</Link>
    </div>
    <p className="mt-4 text-xs leading-5 text-[#66716b]">New accounts must verify their email before accepting an invitation.</p>
  </main>;
  const invitations = await db.rpc("my_staff_invitations");
  if (invitations.error) throw new Error("Unable to load staff invitations.");
  return <main className="mx-auto max-w-2xl px-5 py-10"><h1 className="text-2xl font-bold">Staff invitations</h1>
    <p className="mt-2 break-all text-sm text-[#66716b]">{String(data.claims.email ?? "")}</p>
    <div className="mt-6 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{(invitations.data as {id:string;producer_name:string;role:string}[]).map((item) => <section key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h2 className="font-semibold">{item.producer_name}</h2><p className="mt-1 text-sm capitalize text-[#66716b]">{item.role}</p></div><AcceptStaffInvitation id={item.id} /></section>)}</div>
    {!invitations.data?.length ? <p className="mt-5 text-sm text-[#66716b]">No active invitations for your verified email.</p> : null}
    <Link href="/dashboard" className="mt-6 inline-block text-sm font-semibold underline">Continue to your account</Link>
  </main>;
}
