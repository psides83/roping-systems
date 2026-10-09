import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronDown, MapPin, Radio } from "lucide-react";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { PublicClassSchedule } from "@/components/events/public-class-schedule";
import { eventDateRange } from "@/lib/events/event-date-range";
import { PublicEventInformation } from "./public-event-information";

export function PublicScheduledEvent({ event, producerSlug, timezone, configured, now }: { event: PublicEvent; producerSlug: string; timezone: string; configured: boolean; now: number }) {
  const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
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
            <span className="flex items-center gap-2"><CalendarDays size={16} />{eventDateRange(event.startsAt, event.endsAt, timezone)}</span>
            <span className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0" />{[event.venue, event.address].filter(Boolean).join(", ")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddToCalendar event={{ id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, location: [event.venue, event.address].filter(Boolean).join(", "), timezone: timezone }} schedulePath={`/public/${producerSlug}/schedule#event-${event.id}`} />
          {event.status === "in_progress" ? <Link href={`/public/${producerSlug}?event=${event.slug}`} className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">Live results<ArrowRight size={15} /></Link> : null}
          {open && configured ? <Link href={`/public/${producerSlug}/${event.slug}/enter`} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-bold text-white">Enter online<ArrowRight size={15} /></Link> : null}
        </div>
      </header>
      <PublicEventInformation event={event} timezone={timezone} />
      <details className="group/schedule mt-4">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md py-2 text-sm font-semibold text-[var(--brand-accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] [&::-webkit-details-marker]:hidden">
          Roping schedule
          <span className="text-xs font-normal text-[#66716b]">{event.scheduledRopings.length} {event.scheduledRopings.length === 1 ? "roping" : "ropings"}</span>
          <ChevronDown size={16} className="transition-transform group-open/schedule:rotate-180 motion-reduce:transition-none" />
        </summary>
      {days.map((day) => <div key={day} className="mt-6">
        <h4 className="border-b border-[#d7ddda] pb-2 text-sm font-bold">{dateLabel(day)}</h4>
        <PublicClassSchedule events={event.scheduledRopings.filter((roping) => roping.scheduledDate === day)} columns timeOnly timezone={timezone} />
      </div>)}
      {!days.length ? <p className="mt-6 text-sm text-[#66716b]">Roping schedule to be announced.</p> : null}
      </details>
    </section>;


}
