import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { ReviewConnection } from "@/components/members/review-connection";

export default async function AccountLinksPage() {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin", "operator"].includes(producer.role)) return <p>Member management access is required.</p>;
  const supabase = await createClient();
  const { data: requests, error } = await supabase.from("membership_link_requests").select("id,status,claimant_name,member_number,reason,account_email").eq("producer_id", producer.id).order("created_at", { ascending: false });
  const { data: members, error: memberError } = await supabase.from("memberships").select("id,member_number,ropers(first_name,last_name)").eq("producer_id", producer.id).order("member_number");
  if (error || memberError) throw new Error("Unable to load account connections.");
  const options = (members ?? []).map((m) => { const r = m.ropers as unknown as { first_name: string; last_name: string }; return { id: m.id, label: `#${m.member_number} · ${r.first_name} ${r.last_name}` }; });
  return <div className="space-y-6"><Link href="/members" className="text-sm font-semibold">Back to members</Link><h1 className="text-2xl font-bold">Account connections</h1>
    <p className="max-w-2xl text-sm text-[#66716b]">Verify the requesting roper through a trusted contact method before approving. A matching name or member number alone is not proof of identity.</p>
    {(requests ?? []).map((q) => <section key={q.id} className="border-t border-[#dfe4e1] py-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{q.claimant_name} · Requested #{q.member_number}</h2><span className="text-sm capitalize">{q.status}</span></div><p className="mt-2 break-words text-sm text-[#66716b]">Confirmed sign-in email at request: {q.account_email}</p>{q.reason ? <p className="mt-2 text-sm text-[#66716b]">{q.reason}</p> : null}{q.status === "pending" || q.status === "approved" ? <ReviewConnection id={q.id} status={q.status} members={options} /> : null}</section>)}
    {!requests?.length ? <p className="text-sm text-[#66716b]">No connection requests.</p> : null}
  </div>;
}
