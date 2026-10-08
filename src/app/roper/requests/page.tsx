import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OnlineEntryRequest } from "@/lib/online-entry-requests";
import { PortalSubmissions } from "@/components/roper/portal-submissions";

export default async function RoperEntryRequestsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/auth/login?next=/roper/requests");
  const { data, error } = await db.rpc("my_online_entry_submissions");
  if (error) throw new Error(`Unable to load entry requests: ${error.message}`);
  const requests = (data ?? []) as OnlineEntryRequest[];
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6">
    <Link href="/roper" className="text-sm font-semibold text-[#66716b]">Back to my portal</Link>
    <h1 className="text-2xl font-bold">My entry requests</h1>
    <p className="text-sm text-[#66716b]">Pending requests can be edited or withdrawn before entries close. Contact the producer about confirmed entries.</p>
    {requests.length ? requests.map((request) => <section key={request.id}><p className="text-xs font-semibold text-[#66716b]">{request.producerName}</p><PortalSubmissions submissions={[request]} timezone={request.timezone} /></section>) : <p className="py-6 text-sm text-[#66716b]">No entry requests linked to your account yet. Sign in before submitting new requests, or connect your existing membership.</p>}
  </main>;
}
