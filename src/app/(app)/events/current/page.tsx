import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function CurrentRopingPage() {
  if (!isSupabaseConfigured()) {
    return <div className="space-y-6"><PageHeader title="Event desk" description="Preview" /><Link href="/events/preview/live" className="text-sm font-semibold underline">Open preview desk</Link></div>;
  }
  const producer = await getActiveProducer();
  const supabase = await createClient();
  const { data, error } = producer
    ? await supabase.from("events")
        .select("id, title, status, starts_at, venue_name, event_ropings(id)")
        .eq("producer_id", producer.id)
        .in("status", ["draft", "scheduled", "entries_open", "entries_closed", "in_progress"])
        .order("starts_at")
    : { data: [], error: null };
  if (error) throw new Error(`Unable to load event desks: ${error.message}`);
  const events = [...(data ?? [])].sort((a, b) =>
    Number(b.status === "in_progress") - Number(a.status === "in_progress"));
  const dates = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    timeZone: producer?.timezone ?? "America/Chicago",
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Event desk" description="Active and upcoming events"
        actions={<Link href="/events" className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><CalendarDays size={16} /> All events</Link>} />
      {events.length ? (
        <div className="divide-y divide-[#e7ebe8] border-y border-[#dfe4e1]">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.id}/live`}
              className="flex flex-wrap items-center justify-between gap-4 px-2 py-5 hover:bg-[#f7f8f7]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold break-words">{event.title}</h2><StatusPill status={event.status} /></div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#66716b]">
                  <span>{dates.format(new Date(event.starts_at))}</span>
                  {event.venue_name ? <span className="flex items-center gap-1"><MapPin size={14} />{event.venue_name}</span> : null}
                  <span>{event.event_ropings.length} ropings</span>
                </div>
              </div>
              <span className="flex items-center gap-2 text-sm font-semibold">Open desk <ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      ) : <div className="py-12 text-center"><h2 className="font-bold">No active or upcoming events</h2><Link href="/events" className="mt-3 inline-block text-sm font-semibold underline">Manage events</Link></div>}
    </div>
  );
}
