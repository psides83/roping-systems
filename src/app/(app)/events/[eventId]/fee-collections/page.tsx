import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { EventFeeSummary } from "@/components/events/event-fee-summary";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export default async function EventFeeCollectionsPage({ params }: PageProps<"/events/[eventId]/fee-collections">) {
  const { eventId } = await params;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const { data: event, error } = await db.from("events").select("id,title,event_fees(id,title,amount_cents)")
    .eq("id", eventId).eq("producer_id", producer.id).is("event_fees.event_roping_id", null).maybeSingle();
  if (error) throw new Error("Unable to load event fee collections.");
  if (!event) notFound();
  return <div className="space-y-6">
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-[#66716b]">
      <Link href="/events" className="font-semibold hover:underline">Events</Link><ChevronRight size={14} aria-hidden="true" />
      <Link href={`/events/${event.id}`} className="max-w-64 truncate font-semibold hover:underline">{event.title}</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">Fee collections</span>
    </nav>
    <PageHeader eyebrow="Event workspace" title="Fee collections" description={event.title} actions={<Link href={`/events/${event.id}`} className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><ArrowLeft size={16} />Event dashboard</Link>} />
    {event.event_fees.length ? <section className="border-y border-[#dfe4e1] py-4"><h2 className="text-sm font-bold">Event-wide charges</h2><div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">{event.event_fees.map((fee) => <p key={fee.id}><span className="font-semibold">{fee.title}</span> · {formatCurrency(fee.amount_cents)} once per contestant</p>)}</div></section> : null}
    <EventFeeSummary eventId={event.id} />
  </div>;
}
