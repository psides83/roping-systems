import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";
import { OnlineEntryForm } from "@/components/ropings/online-entry-form";
import { getBrandStyle } from "@/lib/branding";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function PublicOnlineEntryPage({
  params,
}: PageProps<"/public/[organizationSlug]/[ropingSlug]/enter">) {
  const { organizationSlug, ropingSlug } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const [{ data: rows, error }, { data: optionalFees, error: feeError }] =
    await Promise.all([
      supabase
        .from("public_event_entry_options")
        .select(
          "organization_name, logo_path, brand_primary, brand_accent, allow_guest_entries, roping_id, title, venue_name, address, starts_at, ends_at, entries_close_at, entries_are_open, incentive_enabled, division_id, division_name, division_description, division_starts_at, scheduled_date, schedule_type, schedule_note, maximum_entries_per_person, allow_guests, eligibility_type, minimum_age, maximum_age, estimated_first_entry_cents, sort_order",
        )
        .eq("organization_slug", organizationSlug)
        .eq("roping_slug", ropingSlug)
        .order("sort_order"),
      supabase
        .from("public_event_optional_fees")
        .select("division_id, fee_id, title, amount_cents, kind, scope")
        .eq("organization_slug", organizationSlug)
        .eq("roping_slug", ropingSlug),
    ]);

  if (error) throw new Error(`Unable to load online entries: ${error.message}`);
  if (feeError)
    throw new Error(`Unable to load entry options: ${feeError.message}`);
  if (!rows?.length) notFound();

  const event = rows[0];
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
  const divisions = rows.map((row) => ({
    id: row.division_id,
    name: row.division_name,
    description: row.division_description,
    maximumEntries: row.maximum_entries_per_person,
    allowGuests: row.allow_guests && row.allow_guest_entries,
    estimatedFirstEntryCents: row.estimated_first_entry_cents,
    startsAt: row.division_starts_at
      ? new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(row.division_starts_at))
      : null,
    scheduledDate: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${row.scheduled_date}T12:00:00Z`)),
    scheduleType: row.schedule_type,
    scheduleNote: row.schedule_note,
    incentiveEnabled: row.incentive_enabled,
    eligibilityType: row.eligibility_type ?? "skill",
    minimumAge: row.minimum_age,
    maximumAge: row.maximum_age,
    options: (optionalFees ?? [])
      .filter((fee) => fee.division_id === row.division_id)
      .map((fee) => ({
        id: fee.fee_id,
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
                alt={`${event.organization_name} logo`}
                width={48}
                height={36}
                unoptimized
                className="h-full w-full object-contain"
              />
            </span>
          ) : null}
          <div>
            <p className="font-bold">{event.organization_name}</p>
            <p className="text-xs brand-muted">Online entries</p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <Link
          href={`/public/${organizationSlug}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"
        >
          <ArrowLeft size={16} /> Back to schedule
        </Link>
        <section className="mt-6 border-b border-[#d7ddda] pb-7">
          <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
            Entry request
          </p>
          <h1 className="mt-2 text-3xl font-bold">{event.title}</h1>
          <div className="mt-4 flex flex-col gap-2 text-sm text-[#66716b] sm:flex-row sm:flex-wrap sm:gap-x-6">
            <span className="flex items-center gap-2">
              <CalendarDays size={16} /> {eventDate}
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={16} />{" "}
              {[event.venue_name, event.address].filter(Boolean).join(", ") ||
                "Location pending"}
            </span>
            {closingDate ? (
              <span className="flex items-center gap-2">
                <Clock3 size={16} /> Entries close {closingDate}
              </span>
            ) : null}
          </div>
        </section>
        <div className="mt-7 max-w-3xl">
          {event.entries_are_open ? (
            <OnlineEntryForm
              organizationSlug={organizationSlug}
              ropingSlug={ropingSlug}
              allowGuests={event.allow_guest_entries}
              divisions={divisions}
            />
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-bold text-amber-950">
                Online entries are not open
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                The entry window for this roping has not opened yet or has
                already closed. Contact the organization for assistance.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
