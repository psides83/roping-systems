import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin, Radio } from "lucide-react";
import { PublicResultsRefresh } from "@/components/public-results-refresh";
import { PublicEventBrowser } from "@/components/events/public-event-browser";
import { PublicResultsWorkspace } from "@/components/events/public-results-workspace";
import { PublicClassSchedule } from "@/components/events/public-class-schedule";
import { getPublicData } from "@/lib/events/public-event-data";
import { publicEventDate, selectPublicEvent } from "@/lib/events/public-event-navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getBrandStyle } from "@/lib/branding";

export default async function ProducerPublicPage({ params, searchParams }: PageProps<"/public/[producerSlug]">) {
  const { producerSlug } = await params;
  const query = await searchParams;
  const requestedEvent = typeof query.event === "string" ? query.event : undefined;
  const data = await getPublicData(producerSlug, requestedEvent);
  if (!data) notFound();
  const selectedEvent = selectPublicEvent(data.events, requestedEvent);
  if (requestedEvent && !selectedEvent) notFound();
  const upcoming = data.events.filter((event) => ["scheduled", "entries_open", "entries_closed"].includes(event.status));

  return (
    <main style={getBrandStyle(data.producer.brandPrimary, data.producer.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
      {isSupabaseConfigured() ? <PublicResultsRefresh live={selectedEvent?.status === "in_progress"} /> : null}
      <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
        <div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={`/public/${producerSlug}`} className="flex min-w-0 items-center gap-3">
            {data.producer.logoUrl ? (
              <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1">
                <Image src={data.producer.logoUrl} alt={`${data.producer.name} logo`} width={48} height={36} unoptimized className="h-full w-full object-contain" />
              </span>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md brand-accent-fill text-sm font-black">
                {data.producer.name.split(" ").slice(0, 2).map((word: string) => word[0]).join("")}
              </span>
            )}
            <h1 className="break-words text-lg font-bold sm:text-xl">{data.producer.name}</h1>
          </Link>
          <nav aria-label="Producer public pages" className="flex items-center gap-5 text-sm font-semibold brand-muted">
            <a href="#results" className="brand-hover">Results</a>
            <a href="#schedule" className="brand-hover">Schedule</a>
            {data.membershipFormPublished ? <Link href={`/public/${producerSlug}/membership`} className="brand-hover">Membership</Link> : null}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-6 sm:py-8">
        <section id="results" className="scroll-mt-4">
          <h2 className="mb-5 text-xl font-bold">Roping results</h2>
          <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <PublicEventBrowser events={data.events} selectedSlug={selectedEvent?.slug} producerSlug={producerSlug} seasons={data.seasons} timezone={data.producer.timezone} />
            <div className="min-w-0 space-y-5">
              {selectedEvent && ["in_progress", "completed"].includes(selectedEvent.status) ? (
                <>
                  <header className="border-b border-[#d7ddda] pb-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 ${selectedEvent.status === "in_progress" ? "bg-emerald-100 text-emerald-800" : "bg-[#e7ebe8] text-[#526058]"}`}>
                        {selectedEvent.status === "in_progress" ? <Radio size={13} /> : null}
                        {selectedEvent.status === "in_progress" ? "Live" : selectedEvent.status === "completed" ? "Completed event" : "Scheduled"}
                      </span>
                      <span className={`rounded px-2 py-1 ${selectedEvent.resultStatus === "official" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                        {selectedEvent.resultStatus === "official" ? "Official results" : "Unofficial results"}
                      </span>
                    </div>
                    <h3 className="mt-3 break-words text-2xl font-bold">{selectedEvent.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]">
                      <span className="flex items-center gap-2"><CalendarDays size={15} /> {publicEventDate(selectedEvent.startsAt)}</span>
                      <span className="flex min-w-0 items-center gap-2"><MapPin size={15} className="shrink-0" /> {[selectedEvent.venue, selectedEvent.address].filter(Boolean).join(", ")}</span>
                    </div>
                    {selectedEvent.scheduledRopings.length ? (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-semibold text-[var(--brand-accent-strong)]">Event schedule · {selectedEvent.scheduledRopings.length} ropings</summary>
                        <PublicClassSchedule events={selectedEvent.scheduledRopings} live />
                      </details>
                    ) : null}
                  </header>
                  <PublicResultsWorkspace key={selectedEvent.id} eventSlug={selectedEvent.slug} ropings={selectedEvent.scheduledRopings} results={data.results} fourDResults={data.fourDResults}
                    runs={data.roundResults} moneyResults={data.moneyResults} shortRoundRopingIds={data.shortRoundRopingIds}
                    initialRopingId={typeof query.roping === "string" ? query.roping : undefined} />
                </>
              ) : <p className="py-10 text-sm text-[#66716b]">No results are available yet. <a href="#schedule" className="font-semibold text-[var(--brand-accent-strong)]">View upcoming events</a></p>}
            </div>
          </div>
        </section>
        <section id="schedule" className="scroll-mt-4 border-t border-[#d7ddda] pt-8">
          <h2 className="text-xl font-bold">Upcoming events</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {upcoming.map((event) => {
              const open = event.status !== "entries_closed" && (!event.entriesOpenAt || new Date(event.entriesOpenAt) <= new Date()) && (!event.entriesCloseAt || new Date(event.entriesCloseAt) > new Date());
              return (
                <article key={event.id} className="rounded-md border border-[#dfe4e1] bg-white p-5">
                  <p className="text-xs font-semibold text-[var(--brand-accent-strong)]">{publicEventDate(event.startsAt)}</p>
                  <h3 className="mt-2 font-bold">{event.title}</h3>
                  <p className="mt-2 text-sm text-[#66716b]">{[event.venue, event.address].filter(Boolean).join(", ")}</p>
                  <PublicClassSchedule events={event.scheduledRopings} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-xs font-semibold ${open ? "text-emerald-700" : "text-[#66716b]"}`}>{open ? "Entries open" : "Entries closed"}</p>
                    {open && isSupabaseConfigured() ? <Link href={`/public/${producerSlug}/${event.slug}/enter`} className="flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-xs font-bold text-white">Enter online <ArrowRight size={14} /></Link> : null}
                  </div>
                </article>
              );
            })}
            {!upcoming.length ? <p className="text-sm text-[#758078]">No upcoming events are published.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
