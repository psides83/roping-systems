import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleDollarSign, Search, Users } from "lucide-react";
import { EntryFormDialog } from "@/components/ropings/entry-form-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export default async function EventEntriesPage({ params }: PageProps<"/ropings/[ropingId]/entries">) {
  const { ropingId } = await params;
  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const [{ data: roping }, { data: membershipData }, { data: entryData, error: entryError }, { data: chargeData }] = await Promise.all([
    supabase.from("ropings").select("id, title, status, roping_divisions(id, name, allow_guests, sort_order)").eq("id", ropingId).eq("organization_id", organization.id).single(),
    supabase.from("organization_memberships").select("member_number, people!inner(id, first_name, last_name)").eq("organization_id", organization.id).eq("status", "active").order("member_number"),
    supabase.from("entries").select("id, entry_number, source, payment_status, person_id, roping_divisions!inner(name), people!inner(first_name, last_name)").eq("roping_id", ropingId).order("entered_at", { ascending: false }),
    supabase.from("entry_charges").select("person_id, amount_cents, waived_at").eq("roping_id", ropingId),
  ]);
  if (!roping) notFound();
  if (entryError) throw new Error(`Unable to load event entries: ${entryError.message}`);
  const divisions = (roping.roping_divisions as unknown as Array<{ id: string; name: string; allow_guests: boolean; sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order).map((division) => ({ id: division.id, name: division.name, allowGuests: division.allow_guests }));
  const people = (membershipData ?? []).map((membership) => { const person = membership.people as unknown as { id: string; first_name: string; last_name: string }; return { id: person.id, name: `${person.first_name} ${person.last_name}`, memberNumber: membership.member_number }; });
  const chargesByPerson = new Map<string, number>();
  (chargeData ?? []).forEach((charge) => chargesByPerson.set(charge.person_id, (chargesByPerson.get(charge.person_id) ?? 0) + (charge.waived_at ? 0 : charge.amount_cents)));
  const entries = entryData.map((entry) => { const person = entry.people as unknown as { first_name: string; last_name: string }; const division = entry.roping_divisions as unknown as { name: string }; return { id: entry.id, name: `${person.first_name} ${person.last_name}`, personId: entry.person_id, division: division.name, entryNumber: entry.entry_number, source: entry.source, paymentStatus: entry.payment_status }; });
  const unpaidCount = entries.filter((entry) => entry.paymentStatus === "unpaid").length;

  return <div className="space-y-6"><Link href={`/ropings/${ropingId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"><ArrowLeft size={16} /> Back to event</Link><PageHeader eyebrow="Event entries" title={roping.title} description="Add office entries, track repeat entries, and confirm cash payments." actions={<EntryFormDialog ropingId={ropingId} divisions={divisions} people={people} />} /><section className="grid gap-3 sm:grid-cols-3"><Metric label="Total entries" value={String(entries.length)} icon={Users} /><Metric label="Unpaid entries" value={String(unpaidCount)} icon={CircleDollarSign} /><Metric label="Charges created" value={formatCurrency(Array.from(chargesByPerson.values()).reduce((sum, value) => sum + value, 0))} icon={CircleDollarSign} /></section><section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"><div className="border-b border-[#e7ebe8] p-4"><label className="flex h-10 max-w-md items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]"><Search size={17} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search contestant or division" /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]"><tr><th className="px-5 py-3">Contestant</th><th className="px-5 py-3">Division</th><th className="px-5 py-3">Entry</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3 text-right">Contestant total</th></tr></thead><tbody className="divide-y divide-[#e7ebe8]">{entries.map((entry) => <tr key={entry.id}><td className="px-5 py-4 text-sm font-semibold">{entry.name}</td><td className="px-5 py-4 text-sm">{entry.division}</td><td className="px-5 py-4 text-sm">#{entry.entryNumber}</td><td className="px-5 py-4 text-sm capitalize text-[#66716b]">{entry.source}</td><td className="px-5 py-4"><StatusPill status={entry.paymentStatus} /></td><td className="px-5 py-4 text-right text-sm font-bold">{formatCurrency(chargesByPerson.get(entry.personId) ?? 0)}</td></tr>)}{!entries.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-[#758078]">No entries have been received yet.</td></tr> : null}</tbody></table></div></section></div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return <div className="rounded-md border border-[#dfe4e1] bg-white p-4"><div className="flex items-center gap-2 text-[#66716b]"><Icon size={16} /><p className="text-xs font-semibold">{label}</p></div><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}
