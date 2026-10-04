import Link from "next/link";
import { ArrowRight, CalendarDays, CircleDollarSign, Clock3, Plus, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { events as demoRopings } from "@/data/demo";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { RopingStatus, RopingSummary } from "@/types/domain";

interface DashboardData {
  firstName: string;
  activeMembers: number;
  pendingMembers: number;
  upcomingRopings: number;
  totalEntries: number;
  unpaidEntries: number;
  schedule: RopingSummary[];
  liveEvent: { id: string; title: string; divisionName: string; completeRuns: number; totalRuns: number } | null;
}

async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { firstName: "Payton", activeMembers: 248, pendingMembers: 7, upcomingRopings: 3, totalEntries: 86, unpaidEntries: 12, schedule: demoRopings.slice(0, 3), liveEvent: { id: "fall-classic", title: "Fall Classic", divisionName: "Calf roping · Open", completeRuns: 19, totalRuns: 34 } };
  const producer = await getActiveProducer();
  if (!producer) throw new Error("No active producer was found.");
  const supabase = await createClient();
  const [{ data: claims }, activeMembers, pendingMembers, upcomingRopings, totalEntries, unpaidEntries, scheduleResult, liveResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).eq("status", "active"),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).eq("status", "pending"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).in("status", ["scheduled", "entries_open", "entries_closed", "in_progress"]),
    supabase.from("roping_entries").select("id", { count: "exact", head: true }).eq("producer_id", producer.id),
    supabase.from("roping_entries").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).eq("payment_status", "unpaid"),
    supabase.from("events").select("id, title, starts_at, venue_name, venue_city, venue_state, status, result_status, event_ropings(id), entries:roping_entries(id)").eq("producer_id", producer.id).order("starts_at", { ascending: false }).limit(3),
    supabase.from("events").select("id, title").eq("producer_id", producer.id).eq("status", "in_progress").limit(1).maybeSingle(),
  ]);
  if (scheduleResult.error) throw new Error(`Unable to load dashboard: ${scheduleResult.error.message}`);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: producer.timezone });
  const schedule: RopingSummary[] = scheduleResult.data.map((event) => ({ id: event.id, title: event.title, date: dateFormatter.format(new Date(event.starts_at)), location: [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(", ") || "Location pending", divisions: (event.event_ropings as unknown as unknown[]).length, entries: (event.entries as unknown as unknown[]).length, status: event.status as RopingStatus, resultStatus: event.result_status }));
  let liveEvent: DashboardData["liveEvent"] = null;
  if (liveResult.data) {
    const { data: division } = await supabase.from("event_ropings").select("id, name").eq("event_id", liveResult.data.id).order("sort_order").limit(1).maybeSingle();
    if (division) {
      const [{ count: totalRuns }, { count: completeRuns }] = await Promise.all([supabase.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", division.id), supabase.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", division.id).neq("status", "pending")]);
      liveEvent = { id: liveResult.data.id, title: liveResult.data.title, divisionName: division.name, completeRuns: completeRuns ?? 0, totalRuns: totalRuns ?? 0 };
    }
  }
  const metadata = claims?.claims?.user_metadata as { first_name?: string } | undefined;
  return { firstName: metadata?.first_name ?? "there", activeMembers: activeMembers.count ?? 0, pendingMembers: pendingMembers.count ?? 0, upcomingRopings: upcomingRopings.count ?? 0, totalEntries: totalEntries.count ?? 0, unpaidEntries: unpaidEntries.count ?? 0, schedule, liveEvent };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const stats = [{ label: "Active members", value: String(data.activeMembers), detail: `${data.pendingMembers} pending approval`, icon: Users, color: "bg-emerald-50 text-emerald-700" }, { label: "Upcoming events", value: String(data.upcomingRopings), detail: data.schedule[0]?.date ?? "Nothing scheduled", icon: CalendarDays, color: "bg-sky-50 text-sky-700" }, { label: "Total entries", value: String(data.totalEntries), detail: "Across producer events", icon: UserCheck, color: "bg-amber-50 text-amber-700" }, { label: "Unpaid entries", value: String(data.unpaidEntries), detail: "Cash payments to confirm", icon: CircleDollarSign, color: "bg-rose-50 text-rose-700" }];

  return <div className="space-y-7"><PageHeader eyebrow={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())} title={`Good afternoon, ${data.firstName}`} description={data.liveEvent ? `${data.liveEvent.title} is in progress. Open the event desk to manage runs and publish live results.` : "Membership, scheduling, and event operations are ready for today."} actions={<Link href="/events" className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white hover:bg-[var(--brand-primary-soft)]"><Plus size={17} /> New roping</Link>} /><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => { const Icon = stat.icon; return <div key={stat.label} className="rounded-md border border-[#dfe4e1] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#66716b]">{stat.label}</p><p className="mt-2 text-3xl font-bold">{stat.value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-md ${stat.color}`}><Icon size={19} /></span></div><p className="mt-3 text-xs text-[#7b857f]">{stat.detail}</p></div>; })}</section>{data.liveEvent ? <section className="overflow-hidden rounded-md border border-[#e0c2b9] bg-white"><div className="flex flex-col gap-4 bg-[#fff8f5] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full brand-accent-fill ring-4 ring-[#f7d9d0]" /><div><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Live now</p><h2 className="mt-1 text-lg font-bold">{data.liveEvent.title}</h2><p className="mt-1 text-sm text-[#66716b]">{data.liveEvent.divisionName} · {data.liveEvent.completeRuns} of {data.liveEvent.totalRuns} runs complete</p></div></div><Link href={isSupabaseConfigured() ? `/events/${data.liveEvent.id}/live` : "/events/current"} className="flex h-10 items-center justify-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">Open event desk <ArrowRight size={16} /></Link></div></section> : null}<div className="grid gap-5 xl:grid-cols-[1fr_360px]"><section className="rounded-md border border-[#dfe4e1] bg-white"><div className="flex items-center justify-between border-b border-[#e7ebe8] px-5 py-4"><div><h2 className="font-bold">Roping schedule</h2><p className="mt-1 text-xs text-[#758078]">Recent and upcoming events</p></div><Link href="/events" className="text-sm font-semibold text-[var(--brand-accent-strong)]">View all</Link></div><div className="divide-y divide-[#e7ebe8]">{data.schedule.map((roping) => <Link href={isSupabaseConfigured() ? `/events/${roping.id}` : roping.status === "in_progress" ? "/events/current" : "/events"} key={roping.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#fafbfa]"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#f0f2f1] text-center"><span className="text-[10px] font-bold uppercase text-[#7b857f]">{roping.date.split(" ")[0]}</span><span className="-mt-1 text-lg font-bold">{roping.date.split(" ")[1]?.replace(",", "")}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{roping.title}</p><p className="mt-1 truncate text-xs text-[#758078]">{roping.location}</p></div><StatusPill status={roping.status} /></Link>)}{!data.schedule.length ? <p className="px-5 py-10 text-center text-sm text-[#758078]">No events yet.</p> : null}</div></section><section className="rounded-md border border-[#dfe4e1] bg-white p-5"><div className="flex items-center gap-2"><Clock3 size={18} className="text-[var(--brand-accent-strong)]" /><h2 className="font-bold">Needs attention</h2></div><div className="mt-4 space-y-4"><div className="border-l-2 border-amber-400 pl-3"><p className="text-sm font-semibold">{data.pendingMembers} memberships pending</p><p className="mt-1 text-xs text-[#758078]">Applications are ready for review.</p></div><div className="border-l-2 border-rose-400 pl-3"><p className="text-sm font-semibold">{data.unpaidEntries} unpaid entries</p><p className="mt-1 text-xs text-[#758078]">Cash payments need confirmation.</p></div></div></section></div></div>;
}
