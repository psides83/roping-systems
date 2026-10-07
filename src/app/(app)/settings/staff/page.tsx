import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { StaffAccessForm } from "@/components/settings/staff-access-form";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { isPlatformOwner } from "@/lib/platform-access";
export default async function StaffPage() {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const canManage = ["owner", "admin"].includes(producer.role);
  const platformOwner = await isPlatformOwner();
  const db = await createClient();
  const staff = await readAllRows((first,last) => db.from("producer_staff_directory").select("user_id,email,role")
    .eq("producer_id",producer.id).order("user_id").range(first,last), "Unable to load staff");
  const invitations = canManage ? await readAllRows((first,last) => db.from("producer_staff_invitations")
    .select("id,email,role,expires_at,email_status").eq("producer_id",producer.id).is("accepted_at",null).is("cancelled_at",null)
    .order("id").range(first,last), "Unable to load invitations") : [];
  return <section className="space-y-6"><Link href="/settings" className="text-sm font-semibold text-[#66716b]">Back to settings</Link>
    <h1 className="text-2xl font-bold">Staff access</h1>
    {canManage ? <StaffAccessForm operation="invite" owner={producer.role === "owner"} platformOwner={platformOwner} /> : null}
    <div className="divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{staff.map((person) => {
      const editable = canManage && person.role !== "owner" && (producer.role === "owner" || !["owner","admin"].includes(person.role));
      return <div key={person.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-all text-sm font-semibold">{person.email}</p><p className="mt-1 text-xs capitalize text-[#66716b]">{person.role === "admin" ? "Administrator" : person.role}</p></div>
        {editable ? <div className="flex flex-wrap gap-2"><StaffAccessForm operation="role" id={person.user_id} role={person.role} owner={producer.role === "owner"} /><StaffAccessForm operation="remove" id={person.user_id} /></div> : null}</div>;
    })}</div>
    {canManage ? <section><h2 className="text-lg font-bold">Pending invitations</h2><p className="mt-2 text-sm text-[#66716b]">Acceptance page: <Link href="/staff-invitations" className="underline">{process.env.NEXT_PUBLIC_SITE_URL ?? "https://roping-systems.vercel.app"}/staff-invitations</Link></p>
      <div className="mt-3 divide-y divide-[#dfe4e1]">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="break-all text-sm font-semibold">{invitation.email}</p><p className="mt-1 text-xs text-[#66716b]">{invitation.role} · Expires {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:producer.timezone}).format(new Date(invitation.expires_at))}</p></div>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${invitation.email_status === "failed" ? "bg-rose-50 text-rose-700" : "bg-[#eef1ef] text-[#66716b]"}`}>{({ not_sent:"Not emailed",sending:"Sending",sent:"Email submitted",failed:"Email failed" } as Record<string,string>)[invitation.email_status]}</span>
        {producer.role === "owner" || !["owner","admin"].includes(invitation.role) ? <div className="flex flex-wrap gap-2"><StaffAccessForm operation="send" id={invitation.id} /><StaffAccessForm operation="cancel" id={invitation.id} /></div> : null}</div>)}</div>{!invitations.length ? <p className="mt-3 text-sm text-[#66716b]">No pending invitations.</p> : null}</section> : null}
  </section>;
}
