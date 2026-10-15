import Link from "next/link";
import { ArrowRight, CalendarDays, CircleDollarSign, Clock3, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { events as demoRopings } from "@/data/demo";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { ProducerFeatureGate } from "@/components/settings/producer-features-context";
import { createClient } from "@/lib/supabase/server";
import type { RopingStatus, RopingSummary } from "@/types/domain";

interface DashboardData {
  firstName: string;
  timezone: string;
  nextEventDate: string | null;
  unpaidEvents: { id: string; title: string; count: number }[];
  activeMembers: number;
  pendingMembers: number;
  upcomingRopings: number;
  totalEntries: number;
  unpaidEntries: number;
  schedule: RopingSummary[];
  liveEvent: { id: string; title: string; divisionName: string; completeRuns: number; totalRuns: number } | null;
}

async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return { firstName: "Payton", timezone: "America/Chicago", nextEventDate: "Nov 14, 2026", unpaidEvents: [{ id: "preview", title: "Fall Classic", count: 12 }], activeMembers: 248, pendingMembers: 7, upcomingRopings: 3, totalEntries: 86, unpaidEntries: 12, schedule: [...demoRopings].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 3), liveEvent: { id: "fall-classic", title: "Fall Classic", divisionName: "Calf roping · Open", completeRuns: 19, totalRuns: 34 } };
  const producer = await getActiveProducer();
  if (!producer) throw new Error("No active producer was found.");
  const supabase = await createClient();
  const [{ data: claims }, activeMembers, pendingMembers, upcomingRopings, totalEntries, unpaidEntries, scheduleResult, liveResult, nextEvent, unpaidRows] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).eq("status", "active"),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).or("status.eq.pending,and(status.eq.active,formally_approved.eq.false)"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).in("status", ["scheduled", "entries_open", "entries_closed", "in_progress"]),
    supabase.from("roping_entries").select("id", { count: "exact", head: true }).eq("producer_id", producer.id),
    supabase.from("roping_entries").select("id", { count: "exact", head: true }).eq("producer_id", producer.id).eq("payment_status", "unpaid"),
    supabase.from("events").select("id, title, starts_at, venue_name, venue_city, venue_state, status, result_status, event_ropings(id), entries:roping_entries(id)").eq("producer_id", producer.id).order("starts_at", { ascending: false }).limit(3),
    supabase.from("events").select("id, title").eq("producer_id", producer.id).eq("status", "in_progress").order("starts_at").limit(1).maybeSingle(),
    supabase.from("events").select("starts_at").eq("producer_id", producer.id).in("status", ["scheduled", "entries_open", "entries_closed"]).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1).maybeSingle(),
    readAllRows<{ id: string; event_id: string; events: unknown }>((first, last) => supabase.from("roping_entries").select("id,event_id,events!inner(title)").eq("producer_id", producer.id).eq("payment_status", "unpaid").order("id").range(first, last), "Unable to load payment attention"),
  ]);
  for (const result of [activeMembers, pendingMembers, upcomingRopings, totalEntries, unpaidEntries, scheduleResult, liveResult, nextEvent]) {
    if (result.error) throw new Error(`Unable to load dashboard: ${result.error.message}`);
  }
  const unpaidByEvent = new Map<string, { id: string; title: string; count: number }>();
  for (const row of unpaidRows) {
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as { title: string };
    const item = unpaidByEvent.get(row.event_id) ?? { id: row.event_id, title: event.title, count: 0 };
    item.count += 1;
    unpaidByEvent.set(row.event_id, item);
  }
  const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: producer.timezone });
  const schedule: RopingSummary[] = (scheduleResult.data ?? []).map((event) => ({ id: event.id, title: event.title, date: dateFormatter.format(new Date(event.starts_at)), location: [event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(", ") || "Location pending", divisions: (event.event_ropings as unknown as unknown[]).length, entries: (event.entries as unknown as unknown[]).length, status: event.status as RopingStatus, resultStatus: event.result_status }));
  let liveEvent: DashboardData["liveEvent"] = null;
  if (liveResult.data) {
    const { data: division } = await supabase.from("event_ropings").select("id, name").eq("event_id", liveResult.data.id).order("sort_order").limit(1).maybeSingle();
    if (division) {
      const [{ count: totalRuns }, { count: completeRuns }] = await Promise.all([supabase.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", division.id), supabase.from("competition_runs").select("id", { count: "exact", head: true }).eq("event_roping_id", division.id).neq("status", "pending")]);
      liveEvent = { id: liveResult.data.id, title: liveResult.data.title, divisionName: division.name, completeRuns: completeRuns ?? 0, totalRuns: totalRuns ?? 0 };
    }
  }
  const metadata = claims?.claims?.user_metadata as { first_name?: string } | undefined;
  return { firstName: metadata?.first_name ?? "there", timezone: producer.timezone, nextEventDate: nextEvent.data ? dateFormatter.format(new Date(nextEvent.data.starts_at)) : null, unpaidEvents: [...unpaidByEvent.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)), activeMembers: activeMembers.count ?? 0, pendingMembers: pendingMembers.count ?? 0, upcomingRopings: upcomingRopings.count ?? 0, totalEntries: totalEntries.count ?? 0, unpaidEntries: unpaidEntries.count ?? 0, schedule, liveEvent };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const stats = [{ label: "Active members", value: String(data.activeMembers), detail: `${data.pendingMembers} pending approval`, icon: Users, color: "bg-emerald-50 text-emerald-700" }, { label: "Active & upcoming events", value: String(data.upcomingRopings), detail: data.nextEventDate ?? "No upcoming date", icon: CalendarDays, color: "bg-sky-50 text-sky-700" }, { label: "Total entries", value: String(data.totalEntries), detail: "Across producer events", icon: UserCheck, color: "bg-amber-50 text-amber-700" }, { label: "Unpaid entries", value: String(data.unpaidEntries), detail: "Entries needing payment review", icon: CircleDollarSign, color: "bg-rose-50 text-rose-700" }];

  return <div className="space-y-6">
    <PageHeader eyebrow={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: data.timezone }).format(new Date())}
      title={`Welcome, ${data.firstName}`} description="Your events, outstanding work, and producer activity."
      actions={<Link href="/events" className="inline-flex min-h-11 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"><CalendarDays size={17} />Manage events</Link>} />
    {data.liveEvent && <section className="rounded-lg border border-[#e0c2b9] bg-[#fff8f5] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--brand-accent-strong)]"><span className="h-2 w-2 rounded-full brand-accent-fill" />Live now</p>
          <h2 className="mt-2 text-lg font-bold">{data.liveEvent.title}</h2><p className="mt-1 text-sm text-[#66716b]">{data.liveEvent.divisionName} · {data.liveEvent.completeRuns} of {data.liveEvent.totalRuns} runs complete</p></div>
        <Link href={isSupabaseConfigured() ? `/events/${data.liveEvent.id}/live` : "/events/preview/live"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">Open event desk<ArrowRight size={16} /></Link>
      </div>
    </section>}
    <section aria-labelledby="attention-title" className="rounded-lg border border-[#dfe4e1] bg-white p-5">
      <div className="flex items-center gap-2"><Clock3 size={18} className="text-[var(--brand-accent-strong)]" /><h2 id="attention-title" className="font-bold">Needs attention</h2></div>
      <div className="mt-3 divide-y divide-[#e7ebe8]">
        <ProducerFeatureGate feature="require_memberships">{data.pendingMembers > 0 && <Link href="/members?status=pending" className="flex min-h-14 items-center justify-between gap-4 py-3 hover:text-[var(--brand-accent-strong)]"><div><p className="text-sm font-semibold">{data.pendingMembers} {data.pendingMembers === 1 ? "membership needs" : "memberships need"} review</p><p className="mt-1 text-sm text-[#66716b]">Review pending applications and approvals.</p></div><ArrowRight size={18} className="shrink-0" /></Link>}</ProducerFeatureGate>
        {data.unpaidEvents.map(event => <Link key={event.id} href={`/events/${event.id}/entries?payment=unpaid#entry-ledger`} className="flex min-h-14 items-center justify-between gap-4 py-3 hover:text-[var(--brand-accent-strong)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{event.title}</p><p className="mt-1 text-sm text-[#66716b]">{event.count} unpaid {event.count === 1 ? "entry" : "entries"} · Review payments</p></div><ArrowRight size={18} className="shrink-0" /></Link>)}
        {!data.pendingMembers && !data.unpaidEntries && <p className="py-3 text-sm text-[#66716b]">No pending approvals or unpaid entries to review.</p>}
      </div>
      <Link href="/settings/setup" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand-accent-strong)]">Review setup checklist<ArrowRight size={16} /></Link>
    </section>
    <section aria-label="Producer activity" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat => { const Icon = stat.icon; return <div key={stat.label} className="rounded-lg border border-[#dfe4e1] bg-white p-5"><div className="flex items-start justify-between gap-2"><div><p className="text-sm text-[#66716b]">{stat.label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{stat.value}</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${stat.color}`}><Icon size={19} /></span></div><p className="mt-3 text-sm text-[#66716b]">{stat.detail}</p></div>; })}</section>
    <section className="rounded-lg border border-[#dfe4e1] bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-[#e7ebe8] p-5"><div><h2 className="font-bold">Recent &amp; scheduled events</h2><p className="mt-1 text-sm text-[#66716b]">Latest event dates first</p></div><Link href="/events" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-accent-strong)]">View all</Link></header>
      <div className="divide-y divide-[#e7ebe8]">{data.schedule.map(event => <Link key={event.id} href={isSupabaseConfigured() ? `/events/${event.id}` : event.status === "in_progress" ? "/events/preview/live" : "/events"} className="flex flex-wrap items-center gap-3 p-5 hover:bg-[#fafbfa]"><div className="min-w-0 flex-1"><p className="font-semibold">{event.title}</p><p className="mt-1 text-sm text-[#66716b]">{event.date} · {event.location}</p></div><StatusPill status={event.status} /></Link>)}{!data.schedule.length && <div className="p-6"><p className="font-semibold">Create your first event</p><p className="mt-1 text-sm text-[#66716b]">Start with the setup checklist, then add an event and its roping schedule.</p><Link href="/events" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--brand-accent-strong)]">Manage events<ArrowRight size={16} /></Link></div>}</div>
    </section>
  </div>;
}
