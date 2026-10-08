import { PublicScheduleViews } from "@/components/events/public-schedule-views";
import { PublicScheduledEvent } from "@/components/events/public-scheduled-event";
import { calendarDate } from "@/lib/events/calendar-export";
import { PublicProducerHeader } from "@/components/events/public-producer-header";
import { notFound } from "next/navigation";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { getPublicData } from "@/lib/events/public-event-data";
import { getBrandStyle } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PublicResultsRefresh } from "@/components/public-results-refresh";
import { PublicScheduleJump } from "@/components/events/public-schedule-jump";
import { eventDateRange } from "@/lib/events/event-date-range";

export default async function PublicSchedulePage({ params }: PageProps<"/public/[producerSlug]/schedule">) {
  const { producerSlug } = await params;
  const data = await getPublicData(producerSlug, undefined, false);
  if (!data) notFound();
  const { producer } = data;
  const events = data.events.filter((event) => ["scheduled", "entries_open", "entries_closed", "in_progress"].includes(event.status))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
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

  const eventCard = (event: PublicEvent) => <PublicScheduledEvent event={event} producerSlug={producerSlug} timezone={producer.timezone} configured={isSupabaseConfigured()} now={now} />;

  return (
    <main style={getBrandStyle(producer.brandPrimary, producer.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
      {isSupabaseConfigured() ? <PublicResultsRefresh live={events.some((event) => event.status === "in_progress")} /> : null}
      <PublicProducerHeader slug={producerSlug} name={producer.name} logoUrl={producer.logoUrl} active="schedule" membershipPublished={data.membershipFormPublished} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-bold">Event schedule</h1>
        <PublicScheduleViews today={calendarDate(new Date().toISOString(), producer.timezone)} events={events.map((event) => ({ id: event.id, title: event.title, start: calendarDate(event.startsAt, producer.timezone), end: calendarDate(event.endsAt ?? event.startsAt, producer.timezone), card: eventCard(event) }))}>
        {events.length > 1 ? <PublicScheduleJump months={Array.from(months, ([id, month]) => ({ id, label: month.label }))} events={events.map((event) => ({
          id: event.id,
          label: `${eventDateRange(event.startsAt, event.endsAt, producer.timezone)} · ${event.title}${event.status === "in_progress" ? " · Live" : ""}`,
        }))} /> : null}
        <div className="mt-6 space-y-10">
          {Array.from(months).sort(([a], [b]) => a.localeCompare(b)).map(([key, month]) => (
            <section id={`month-${key}`} key={key} className="scroll-mt-6 space-y-5">
              <h2 className="text-xl font-bold">{month.label}</h2>
          {month.events.map(eventCard)}
            </section>
          ))}
          {!events.length ? <p className="border-t border-[#d7ddda] py-10 text-sm text-[#66716b]">No upcoming events are published.</p> : null}
        </div>
        </PublicScheduleViews>
      </div>
    </main>
  );
}
