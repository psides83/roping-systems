import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { ReviewProfileCorrection } from "@/components/members/review-profile-correction";
export default async function ProfileRequestsPage() {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin", "operator"].includes(producer.role)) return <p>Member management access is required.</p>;
  const supabase = await createClient();
  const { data, error } = await supabase.from("member_profile_corrections").select("id,membership_id,status,original_birth_date,original_gender,requested_birth_date,requested_gender,reason,review_reason,memberships(member_number,ropers(first_name,last_name))").eq("producer_id", producer.id).order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load profile corrections.");
  return <div className="space-y-6"><Link href="/members" className="text-sm font-semibold">Back to members</Link><h1 className="text-2xl font-bold">Profile corrections</h1>
    <p className="max-w-2xl text-sm text-[#66716b]">Verify eligibility details before approving. Approved changes update the shared roper record; existing competition results are not recalculated.</p>
    {(data ?? []).map((q) => { const m = q.memberships as unknown as { member_number: string; ropers: { first_name: string; last_name: string } }; return <section key={q.id} className="space-y-2 border-t border-[#dfe4e1] py-5"><div className="flex flex-wrap justify-between gap-2"><Link href={`/members/${q.membership_id}`} className="font-semibold">{m.ropers.first_name} {m.ropers.last_name} · #{m.member_number}</Link><span className="text-sm capitalize">{q.status}</span></div>
      {q.requested_birth_date ? <p className="text-sm">Birth date: {q.original_birth_date ?? "Not recorded"} → {q.requested_birth_date}</p> : null}{q.requested_gender ? <p className="text-sm">Competition gender: {q.original_gender ?? "Not recorded"} → {q.requested_gender}</p> : null}
      <p className="text-sm text-[#66716b]">{q.reason}</p>{q.review_reason ? <p className="text-sm text-[#66716b]">Staff: {q.review_reason}</p> : null}{q.status === "pending" ? <ReviewProfileCorrection id={q.id} /> : null}
    </section>; })}
    {!data?.length ? <p className="text-sm text-[#66716b]">No profile corrections to review.</p> : null}
  </div>;
}
