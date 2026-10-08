import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";
import { OnlineEntryForm } from "@/components/events/online-entry-form";
import { getBrandStyle } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { loadPublicQualificationNotices } from "@/lib/events/public-qualification-data";
import { ropingDisplayName } from "@/lib/events/roping-display-name";
import type { OnlineEntryRequest } from "@/lib/online-entry-requests";
import { z } from "zod";

interface PublicEntryFee {
  event_roping_id: string;
  event_fee_id: string;
  title: string;
  amount_cents: number;
  kind: string;
  scope: string;
  is_required: boolean;
}

export default async function PublicOnlineEntryPage({
  params,
  searchParams,
}: PageProps<"/public/[producerSlug]/[eventSlug]/enter">) {
  const { producerSlug, eventSlug } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const query = await searchParams;
  let existingRequest: OnlineEntryRequest | undefined;
  if (query.request !== undefined) {
    if (!z.uuid().safeParse(query.request).success) notFound();
    const result = await supabase.rpc("my_online_entry_submission", { target_submission_id: query.request });
    if (result.error || !result.data) notFound();
    existingRequest = result.data as OnlineEntryRequest;
    if (existingRequest.producerSlug !== producerSlug || existingRequest.eventSlug !== eventSlug) notFound();
  }
  const [
    { data: rows, error },
    { data: feeRows, error: feeError },
    { data: location, error: locationError },
  ] = await Promise.all([
    supabase
      .from("public_event_entry_options")
      .select(
        "producer_name, logo_path, brand_primary, brand_accent, allow_non_member_entries, event_id, title, venue_name, address, starts_at, ends_at, entries_close_at, entries_are_open, incentive_enabled, event_roping_id, event_roping_name, division_name, event_roping_description, event_roping_starts_at, scheduled_date, schedule_type, schedule_note, arena_name, max_entries_per_roper, allow_non_members, eligibility_type, minimum_age, maximum_age, estimated_first_entry_cents, sort_order",
      )
      .eq("producer_slug", producerSlug)
      .eq("event_slug", eventSlug)
      .order("sort_order"),
    supabase.rpc("public_online_entry_fees", {
      target_producer_slug: producerSlug,
      target_event_slug: eventSlug,
    }),
    supabase
      .from("public_event_schedule")
      .select("venue_name, address, venue_city, venue_state, venue_postal_code")
      .eq("producer_slug", producerSlug)
      .eq("slug", eventSlug)
      .single(),
  ]);

  if (error) throw new Error(`Unable to load online entries: ${error.message}`);
  if (feeError)
    throw new Error(`Unable to load entry options: ${feeError.message}`);
  if (locationError)
    throw new Error(`Unable to load event location: ${locationError.message}`);
  if (!rows?.length) notFound();

  const event = rows[0];
  const fees = (feeRows ?? []) as PublicEntryFee[];
  const notices = await loadPublicQualificationNotices(producerSlug, event.event_id);
  const logoUrl = event.logo_path
    ? supabase.storage.from("organization-logos").getPublicUrl(event.logo_path)
        .data.publicUrl
    : null;
  const eventDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(event.starts_at));
  const closingDate = event.entries_close_at
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(event.entries_close_at))
    : null;
  const divisions = rows.map((row, index) => ({
    id: row.event_roping_id,
    qualification: notices.get(row.event_roping_id),
    name: ropingDisplayName(row.event_roping_name, row.division_name),
    description: row.event_roping_description,
    maximumEntries: row.max_entries_per_roper,
    allowGuests: row.allow_non_members && row.allow_non_member_entries,
    estimatedFirstEntryCents: row.estimated_first_entry_cents,
    startsAt: row.event_roping_starts_at
      ? new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(row.event_roping_starts_at))
      : null,
    scheduledDate: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${row.scheduled_date}T12:00:00Z`)),
    scheduleType: row.schedule_type,
    followsRopingName:
      row.schedule_type === "follows_previous"
        ? (rows
            .slice(0, index)
            .findLast(
              (previous) =>
                previous.scheduled_date === row.scheduled_date &&
                previous.arena_name === row.arena_name,
            )?.event_roping_name ?? null)
        : null,
    scheduleNote: row.schedule_note,
    incentiveEnabled: row.incentive_enabled,
    eligibilityType: row.eligibility_type ?? "skill",
    minimumAge: row.minimum_age,
    maximumAge: row.maximum_age,
    requiredFees: fees
      .filter((fee) => fee.event_roping_id === row.event_roping_id && fee.is_required)
      .map((fee) => ({ id: fee.event_fee_id, title: fee.title, amountCents: fee.amount_cents, scope: fee.scope })),
    options: fees
      .filter((fee) => fee.event_roping_id === row.event_roping_id && !fee.is_required)
      .map((fee) => ({
        id: fee.event_fee_id,
        title: fee.title,
        amountCents: fee.amount_cents,
        kind: fee.kind,
        scope: fee.scope,
      })),
  }));

  return (
    <main
      style={getBrandStyle(event.brand_primary, event.brand_accent)}
      className="min-h-screen bg-[#f5f6f7]"
    >
      <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
        <div className="mx-auto flex min-h-20 max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          {logoUrl ? (
            <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1">
              <Image
                src={logoUrl}
                alt={`${event.producer_name} logo`}
                width={48}
                height={36}
                unoptimized
                className="h-full w-full object-contain"
              />
            </span>
          ) : null}
          <div>
            <p className="font-bold">{event.producer_name}</p>
            <p className="text-xs brand-muted">Online entries</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <Link
          href={`/public/${producerSlug}/schedule`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"
        >
          <ArrowLeft size={16} /> Back to schedule
        </Link>
        <section className="mt-6 border-b border-[#d7ddda] pb-7">
          <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
            Entry request
          </p>
          <h1 className="mt-2 text-3xl font-bold">{event.title}</h1>
          <Link href={`/public/${producerSlug}/rules`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-[var(--brand-accent-strong)] underline">Read producer rules</Link>
          <div className="mt-4 flex flex-col gap-2 text-sm text-[#66716b] sm:flex-row sm:flex-wrap sm:gap-x-6">
            <span className="flex items-center gap-2">
              <CalendarDays size={16} /> {eventDate}
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={16} />{" "}
              {[
                location.venue_name,
                location.address,
                location.venue_city,
                [location.venue_state, location.venue_postal_code]
                  .filter(Boolean)
                  .join(" "),
              ]
                .filter(Boolean)
                .join(", ") || "Location pending"}
            </span>
            {closingDate ? (
              <span className="flex items-center gap-2">
                <Clock3 size={16} /> Entries close {closingDate}
              </span>
            ) : null}
          </div>
        </section>
        <div className="mt-7 max-w-3xl">
          {event.entries_are_open && (!existingRequest || existingRequest.canModify) ? (
            <OnlineEntryForm
              existingRequest={existingRequest}
              producerSlug={producerSlug}
              eventSlug={eventSlug}
              allowGuests={event.allow_non_member_entries}
              divisions={divisions}
            />
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-bold text-amber-950">
                Online entries are not open
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                The entry window for this roping has not opened yet or has
                already closed. Contact the producer for assistance.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
