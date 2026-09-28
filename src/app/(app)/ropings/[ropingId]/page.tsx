import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CircleDollarSign, ClipboardList, ExternalLink, MapPin, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { ropings as demoRopings, divisionTemplates as demoDivisions } from "@/data/demo";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

interface EventDetail {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  location: string;
  status: string;
  resultStatus: string;
  isPublic: boolean;
  entriesOpenAt: string | null;
  entriesCloseAt: string | null;
  divisions: Array<{ id: string; name: string; runs: number; entries: number; fees: Array<{ id: string; title: string; amountCents: number; included: boolean }> }>;
}

async function getEvent(ropingId: string): Promise<{ event: EventDetail | null; organizationSlug: string }> {
  if (!isSupabaseConfigured()) {
    const roping = demoRopings.find((item) => item.id === ropingId);
    if (!roping) return { event: null, organizationSlug: "red-river-calf-ropers" };
    return { organizationSlug: "red-river-calf-ropers", event: { id: roping.id, title: roping.title, slug: roping.id, startsAt: roping.date, location: roping.location, status: roping.status, resultStatus: roping.resultStatus ?? "unofficial", isPublic: true, entriesOpenAt: null, entriesCloseAt: null, divisions: demoDivisions.slice(0, roping.divisions).map((division, index) => ({ id: division.id, name: division.name, runs: division.numberOfRuns, entries: index === 0 ? roping.entries : 0, fees: division.fees.map((fee) => ({ id: fee.id, title: fee.title, amountCents: fee.amountCents, included: fee.includedInEntryPrice })) })) } };
  }

  const organization = await getActiveOrganization();
  if (!organization) return { event: null, organizationSlug: "" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("ropings").select("id, title, slug, starts_at, venue_name, address, status, result_status, is_public, entries_open_at, entries_close_at, roping_divisions!roping_divisions_roping_id_fkey(id, name, number_of_runs, entries!entries_roping_division_id_fkey(id), roping_fees!roping_fees_roping_division_id_fkey(id, title, amount_cents, included_in_entry_price))").eq("id", ropingId).eq("organization_id", organization.id).single();
  if (error || !data) return { event: null, organizationSlug: organization.slug };
  const divisions = (data.roping_divisions as unknown as Array<{ id: string; name: string; number_of_runs: number; entries: unknown[]; roping_fees: Array<{ id: string; title: string; amount_cents: number; included_in_entry_price: boolean }> }>).map((division) => ({ id: division.id, name: division.name, runs: division.number_of_runs, entries: division.entries.length, fees: division.roping_fees.map((fee) => ({ id: fee.id, title: fee.title, amountCents: fee.amount_cents, included: fee.included_in_entry_price })) }));
  return { organizationSlug: organization.slug, event: { id: data.id, title: data.title, slug: data.slug, startsAt: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: organization.timezone }).format(new Date(data.starts_at)), location: [data.venue_name, data.address].filter(Boolean).join(", ") || "Location pending", status: data.status, resultStatus: data.result_status, isPublic: data.is_public, entriesOpenAt: data.entries_open_at, entriesCloseAt: data.entries_close_at, divisions } };
}

export default async function RopingDetailPage({ params }: PageProps<"/ropings/[ropingId]">) {
  const { ropingId } = await params;
  const { event, organizationSlug } = await getEvent(ropingId);
  if (!event) notFound();
  const totalEntries = event.divisions.reduce((sum, division) => sum + division.entries, 0);
  const totalFees = event.divisions.flatMap((division) => division.fees).reduce((sum, fee) => sum + fee.amountCents, 0);

  return <div className="space-y-6"><PageHeader eyebrow="Roping workspace" title={event.title} description={`${event.startsAt} · ${event.location}`} actions={<><Link href={`/public/${organizationSlug}`} className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white" aria-label="View public page"><ExternalLink size={17} /></Link>{isSupabaseConfigured() ? <><Link href={`/ropings/${event.id}/entries`} className="flex h-10 items-center rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">Entries</Link><Link href={`/ropings/${event.id}/payouts`} className="flex h-10 items-center rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">Payouts</Link></> : null}<Link href={event.status === "in_progress" ? (isSupabaseConfigured() ? `/ropings/${event.id}/live` : "/ropings/current") : "#setup"} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"><Settings2 size={16} />{event.status === "in_progress" ? "Open event desk" : "Event setup"}</Link></>} /><div className="flex flex-wrap items-center gap-3"><StatusPill status={event.status} /><span className="text-xs font-semibold text-[#758078]">Results: {event.resultStatus}</span><span className={`text-xs font-semibold ${event.isPublic ? "text-emerald-700" : "text-[#758078]"}`}>{event.isPublic ? "Published" : "Private"}</span></div><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={CalendarDays} label="Event date" value={event.startsAt.split(" at ")[0]} /><Metric icon={Users} label="Entries" value={String(totalEntries)} /><Metric icon={ClipboardList} label="Divisions" value={String(event.divisions.length)} /><Metric icon={CircleDollarSign} label="Configured fees" value={formatCurrency(totalFees)} /></section><section id="setup" className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"><div className="border-b border-[#e7ebe8] px-5 py-4"><h2 className="font-bold">Division setup</h2><p className="mt-1 text-xs text-[#758078]">Event-specific snapshots copied from organization templates</p></div><div className="divide-y divide-[#e7ebe8]">{event.divisions.map((division) => <div key={division.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">{division.name}</h3><p className="mt-1 text-sm text-[#66716b]">{division.runs} run{division.runs === 1 ? "" : "s"} · {division.entries} entries</p></div><button className="h-9 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold">Manage division</button></div><div className="mt-4 flex flex-wrap gap-2">{division.fees.map((fee) => <span key={fee.id} className="rounded-md bg-[#f1f3f2] px-3 py-2 text-xs font-medium">{fee.title}: {formatCurrency(fee.amountCents)}{fee.included ? " included" : " separate"}</span>)}</div></div>)}</div></section><section className="grid gap-4 lg:grid-cols-2"><div className="rounded-md border border-[#dfe4e1] bg-white p-5"><h2 className="font-bold">Entry window</h2><p className="mt-3 text-sm text-[#66716b]">{event.entriesOpenAt ? "Online entries have a configured opening time." : "Online entry opening time is not set."}</p><p className="mt-2 text-sm text-[#66716b]">{event.entriesCloseAt ? "Online entries have a configured closing time." : "Online entry closing time is not set."}</p></div><div className="rounded-md border border-[#dfe4e1] bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><MapPin size={17} className="text-[var(--brand-accent-strong)]" /> Public listing</h2><p className="mt-3 text-sm leading-6 text-[#66716b]">{event.isPublic ? "This roping appears on the organization’s public schedule. Draw and results publication remain separately controlled." : "This roping is private and does not appear on the public schedule."}</p></div></section></div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="rounded-md border border-[#dfe4e1] bg-white p-4"><div className="flex items-center gap-2 text-[#66716b]"><Icon size={16} /><p className="text-xs font-semibold">{label}</p></div><p className="mt-2 text-xl font-bold">{value}</p></div>;
}
