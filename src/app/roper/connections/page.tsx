import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConnectionRequest } from "@/components/roper/connection-request";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: requests, error } = await supabase.rpc("my_membership_link_requests");
  if (error) throw new Error(`Unable to load connections: ${error.message}`);
  return <main className="mx-auto max-w-5xl space-y-6 px-5 py-7">
    <Link href="/roper" className="text-sm font-semibold">Back to roper portal</Link>
    <h1 className="text-2xl font-bold">Connect a membership</h1>
    <p className="max-w-2xl text-sm text-[#66716b]">Use the producer name from their public page URL and your existing member number. Staff must verify your identity before you can access the record. Each producer approves their own connection.</p>
    <ConnectionRequest />
    <section className="space-y-3 border-t border-[#dfe4e1] pt-5"><h2 className="font-bold">Your requests</h2>
      {(requests ?? []).map((request: { id: string; producer_name: string; member_number: string; status: string }) => <div key={request.id} className="flex flex-wrap justify-between gap-2 border-b border-[#dfe4e1] py-3 text-sm"><span>{request.producer_name} · #{request.member_number}</span><span className="font-semibold capitalize">{request.status}</span></div>)}
      {!requests?.length ? <p className="text-sm text-[#66716b]">No connection requests yet.</p> : null}
    </section>
  </main>;
}
