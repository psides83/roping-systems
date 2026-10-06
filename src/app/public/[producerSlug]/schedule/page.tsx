import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronDown, MapPin, Radio } from "lucide-react";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { getPublicData } from "@/lib/events/public-event-data";
import { getBrandStyle } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PublicClassSchedule } from "@/components/events/public-class-schedule";
import { PublicResultsRefresh } from "@/components/public-results-refresh";
import { PublicScheduleJump } from "@/components/events/public-schedule-jump";

export default async function PublicSchedulePage({ params }: PageProps<"/public/[producerSlug]/schedule">) {
  const { producerSlug } = await params;
  const data = await getPublicData(producerSlug, undefined, false);
  if (!data) notFound();
  const { producer } = data;
  const events = data.events.filter((event) => ["scheduled", "entries_open", "entries_closed", "in_progress"].includes(event.status))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
  const now = new Date().getTime();
  const months = new Map<string, { label: string; events: PublicEvent[] }>();
  for (const event of events) {
    const date = new Date(event.startsAt);
    const key = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: producer.timezone }).format(date);
    const month = months.get(key) ?? {
      label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: producer.timezone }).format(date),
      events: [],
    };
    month.events.push(event);
    months.set(key, month);
  }

  return (
    <main style={getBrandStyle(producer.brandPrimary, producer.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
      {isSupabaseConfigured() ? <PublicResultsRefresh live={events.some((event) => event.status === "in_progress")} /> : null}
      <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
        <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={`/public/${producerSlug}`} className="flex min-w-0 items-center gap-3">
            {producer.logoUrl ? <span className="grid h-11 w-14 shrink-0 place-items-center rounded-md bg-white p-1"><Image src={producer.logoUrl} alt={`${producer.name} logo`} width={48} height={36} unoptimized className="max-h-full w-auto object-contain" /></span> : null}
            <span className="break-words text-lg font-bold sm:text-xl">{producer.name}</span>
          </Link>
          <nav aria-label="Producer public pages" className="flex flex-wrap items-center gap-5 text-sm font-semibold brand-muted">
            <Link href={`/public/${producerSlug}`} className="brand-hover">Results</Link>
            <Link href={`/public/${producerSlug}/schedule`} aria-current="page" className="text-white underline underline-offset-8">Schedule</Link>
            {data.membershipFormPublished ? <Link href={`/public/${producerSlug}/membership`} className="brand-hover">Membership</Link> : null}
            <Link href="/roper" className="brand-hover">Roper portal</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold">Event schedule</h1>
        {events.length > 1 ? <PublicScheduleJump events={events.map((event) => ({
          id: event.id,
          label: `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: producer.timezone }).format(new Date(event.startsAt))} · ${event.title}${event.status === "in_progress" ? " · Live" : ""}`,
        }))} /> : null}
        <div className="mt-6 space-y-10">
          {Array.from(months).sort(([a], [b]) => a.localeCompare(b)).map(([key, month]) => (
            <section key={key} className="space-y-5">
              <h2 className="text-xl font-bold">{month.label}</h2>
          {month.events.map((event) => {
            const open = event.status !== "entries_closed" && (!event.entriesOpenAt || Date.parse(event.entriesOpenAt) <= now) && (!event.entriesCloseAt || Date.parse(event.entriesCloseAt) > now);
            const days = Array.from(new Set(event.scheduledRopings.map((roping) => roping.scheduledDate))).sort();
            const entryStatus = open ? "Entries open" : event.entriesOpenAt && Date.parse(event.entriesOpenAt) > now ? "Entries opening soon" : "Entries closed";
            return <section id={`event-${event.id}`} key={event.id} className="scroll-mt-6 border-t border-[#d7ddda] pt-6">
              <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {event.status === "in_progress" ? <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-emerald-800"><Radio size={13} />In progress</span> : null}
                    <span className={open ? "text-emerald-700" : "text-[#66716b]"}>{entryStatus}</span>
                  </div>
                  <h3 className="mt-2 break-words text-lg font-bold">{event.title}</h3>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]">
                    <span className="flex items-center gap-2"><CalendarDays size={16} />{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: producer.timezone }).format(new Date(event.startsAt))}</span>
                    <span className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0" />{[event.venue, event.address].filter(Boolean).join(", ")}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {event.status === "in_progress" ? <Link href={`/public/${producerSlug}?event=${event.slug}`} className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">Live results<ArrowRight size={15} /></Link> : null}
                  {open && isSupabaseConfigured() ? <Link href={`/public/${producerSlug}/${event.slug}/enter`} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-bold text-white">Enter online<ArrowRight size={15} /></Link> : null}
                </div>
              </header>
              <details className="group/schedule mt-4">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md py-2 text-sm font-semibold text-[var(--brand-accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] [&::-webkit-details-marker]:hidden">
                  Roping schedule
                  <span className="text-xs font-normal text-[#66716b]">{event.scheduledRopings.length} {event.scheduledRopings.length === 1 ? "roping" : "ropings"}</span>
                  <ChevronDown size={16} className="transition-transform group-open/schedule:rotate-180 motion-reduce:transition-none" />
                </summary>
              {days.map((day) => <div key={day} className="mt-6">
                <h4 className="border-b border-[#d7ddda] pb-2 text-sm font-bold">{dateLabel(day)}</h4>
                <PublicClassSchedule events={event.scheduledRopings.filter((roping) => roping.scheduledDate === day)} columns timeOnly timezone={producer.timezone} />
              </div>)}
              {!days.length ? <p className="mt-6 text-sm text-[#66716b]">Roping schedule to be announced.</p> : null}
              </details>
            </section>;
          })}
            </section>
          ))}
          {!events.length ? <p className="border-t border-[#d7ddda] py-10 text-sm text-[#66716b]">No upcoming events are published.</p> : null}
        </div>
      </div>
    </main>
  );
}
