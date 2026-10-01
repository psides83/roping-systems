import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  Gauge,
  MapPin,
  Settings2,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { ShortRoundSettingsForm } from "@/components/ropings/short-round-settings";
import { ClassScheduleDialog } from "@/components/ropings/class-schedule-dialog";
import { ClassRoundOrderingForm } from "@/components/ropings/class-round-ordering-form";
import {
  ropings as demoRopings,
  divisionTemplates as demoDivisions,
} from "@/data/demo";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { formatFinalTimeAdjustment } from "@/lib/scoring";
import type { RoundOrderMethod } from "@/types/domain";
import { updateClassEntrySpacing, updateRopingRounds } from "./actions";

interface EventDetail {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  location: string;
  status: string;
  resultStatus: string;
  isPublic: boolean;
  entriesOpenAt: string | null;
  entriesCloseAt: string | null;
  eventFees: Array<{
    id: string;
    title: string;
    amountCents: number;
  }>;
  divisions: Array<{
    id: string;
    name: string;
    runs: number;
    minimumRunsBetweenEntries: number;
    secondRoundOrdering: RoundOrderMethod;
    laterRoundOrdering: RoundOrderMethod;
    entries: number;
    startsAt: string | null;
    scheduledDate: string;
    scheduledDateValue: string;
    startTime: string;
    scheduleType: "fixed" | "tentative" | "follows_previous";
    scheduleNote: string | null;
    incentiveEnabled: boolean;
    incentiveRules: Array<{
      id: string;
      classification: string;
      adjustmentSeconds: number;
    }>;
    shortRoundEnabled: boolean;
    shortRoundBrackets: Array<{
      minimumEntries: number;
      maximumEntries: number | null;
      comebackCount: number;
    }>;
    fees: Array<{
      id: string;
      title: string;
      amountCents: number;
      included: boolean;
    }>;
  }>;
}

async function getEvent(
  ropingId: string,
): Promise<{ event: EventDetail | null; organizationSlug: string }> {
  if (!isSupabaseConfigured()) {
    const roping = demoRopings.find((item) => item.id === ropingId);
    if (!roping)
      return { event: null, organizationSlug: "red-river-calf-ropers" };
    return {
      organizationSlug: "red-river-calf-ropers",
      event: {
        id: roping.id,
        title: roping.title,
        slug: roping.id,
        startsAt: roping.date,
        location: roping.location,
        status: roping.status,
        resultStatus: roping.resultStatus ?? "unofficial",
        isPublic: true,
        entriesOpenAt: null,
        entriesCloseAt: null,
        eventFees: [
          { id: "preview-office", title: "Office charge", amountCents: 2000 },
        ],
        divisions: demoDivisions
          .slice(0, roping.divisions)
          .map((division, index) => ({
            id: division.id,
            name: division.name,
            runs: index === 2 ? 2 : 1,
            minimumRunsBetweenEntries: index === 1 ? 3 : 0,
            secondRoundOrdering: "reverse_first",
            laterRoundOrdering: "aggregate_slowest_to_fastest",
            entries: index === 0 ? roping.entries : 0,
            startsAt: null,
            scheduledDate: roping.date,
            scheduledDateValue: "2026-09-27",
            startTime: index === 0 ? "09:00" : "",
            scheduleType: index === 2 ? "follows_previous" : "fixed",
            scheduleNote: null,
            incentiveEnabled:
              roping.id === "fall-classic" &&
              division.name.startsWith("Breakaway"),
            incentiveRules:
              roping.id === "fall-classic" &&
              division.name.startsWith("Breakaway")
                ? [
                    {
                      id: "preview-1",
                      classification: "11.5",
                      adjustmentSeconds: 1.5,
                    },
                    {
                      id: "preview-2",
                      classification: "10",
                      adjustmentSeconds: 2,
                    },
                  ]
                : [],
            shortRoundEnabled: index === 0,
            shortRoundBrackets:
              index === 0
                ? [
                    {
                      minimumEntries: 1,
                      maximumEntries: 50,
                      comebackCount: 8,
                    },
                    {
                      minimumEntries: 51,
                      maximumEntries: null,
                      comebackCount: 10,
                    },
                  ]
                : [],
            fees: division.fees.map((fee) => ({
              id: fee.id,
              title: fee.title,
              amountCents: fee.amountCents,
              included: fee.includedInEntryPrice,
            })),
          })),
      },
    };
  }

  const organization = await getActiveOrganization();
  if (!organization) return { event: null, organizationSlug: "" };
  const supabase = await createClient();
  const [{ data, error }, { data: eventFeeData, error: eventFeeError }] =
    await Promise.all([
      supabase
        .from("ropings")
        .select(
          "id, title, slug, starts_at, ends_at, venue_name, address, status, result_status, is_public, entries_open_at, entries_close_at, roping_divisions!roping_divisions_roping_id_fkey(id, name, starts_at, scheduled_date, schedule_type, schedule_note, sort_order, number_of_runs, minimum_runs_between_entries, second_round_ordering, later_round_ordering, incentive_enabled, short_round_enabled, entries!entries_roping_division_id_fkey(id), roping_incentive_rules(id, adjustment_seconds, classifications!inner(name)), roping_short_round_brackets(minimum_entries, maximum_entries, comeback_count, sort_order), roping_fees!roping_fees_roping_division_id_fkey(id, title, amount_cents, included_in_entry_price))",
        )
        .eq("id", ropingId)
        .eq("organization_id", organization.id)
        .single(),
      supabase
        .from("roping_fees")
        .select("id, title, amount_cents")
        .eq("roping_id", ropingId)
        .eq("organization_id", organization.id)
        .is("roping_division_id", null),
    ]);
  if (error || !data)
    return { event: null, organizationSlug: organization.slug };
  if (eventFeeError)
    throw new Error(`Unable to load event charges: ${eventFeeError.message}`);
  const divisions = (
    data.roping_divisions as unknown as Array<{
      id: string;
      name: string;
      number_of_runs: number;
      minimum_runs_between_entries: number;
      second_round_ordering: RoundOrderMethod;
      later_round_ordering: RoundOrderMethod;
      short_round_enabled: boolean;
      starts_at: string | null;
      scheduled_date: string;
      schedule_type: "fixed" | "tentative" | "follows_previous";
      schedule_note: string | null;
      sort_order: number;
      incentive_enabled: boolean;
      entries: unknown[];
      roping_incentive_rules: Array<{
        id: string;
        adjustment_seconds: number;
        classifications: { name: string };
      }>;
      roping_short_round_brackets: Array<{
        minimum_entries: number;
        maximum_entries: number | null;
        comeback_count: number;
        sort_order: number;
      }>;
      roping_fees: Array<{
        id: string;
        title: string;
        amount_cents: number;
        included_in_entry_price: boolean;
      }>;
    }>
  )
    .sort((a, b) =>
      a.scheduled_date === b.scheduled_date
        ? a.sort_order - b.sort_order
        : a.scheduled_date.localeCompare(b.scheduled_date),
    )
    .map((division) => ({
      id: division.id,
      name: division.name,
      runs: division.number_of_runs,
      minimumRunsBetweenEntries: division.minimum_runs_between_entries,
      secondRoundOrdering: division.second_round_ordering,
      laterRoundOrdering: division.later_round_ordering,
      entries: division.entries.length,
      startsAt: division.starts_at
        ? new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZone: organization.timezone,
          }).format(new Date(division.starts_at))
        : null,
      scheduledDate: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${division.scheduled_date}T12:00:00Z`)),
      scheduledDateValue: division.scheduled_date,
      startTime: division.starts_at
        ? new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone: organization.timezone,
          }).format(new Date(division.starts_at))
        : "",
      scheduleType: division.schedule_type,
      scheduleNote: division.schedule_note,
      incentiveEnabled: division.incentive_enabled,
      incentiveRules: division.roping_incentive_rules.map((rule) => ({
        id: rule.id,
        classification: rule.classifications.name,
        adjustmentSeconds: Number(rule.adjustment_seconds),
      })),
      shortRoundEnabled: division.short_round_enabled,
      shortRoundBrackets: division.roping_short_round_brackets
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((bracket) => ({
          minimumEntries: bracket.minimum_entries,
          maximumEntries: bracket.maximum_entries,
          comebackCount: bracket.comeback_count,
        })),
      fees: division.roping_fees.map((fee) => ({
        id: fee.id,
        title: fee.title,
        amountCents: fee.amount_cents,
        included: fee.included_in_entry_price,
      })),
    }));
  return {
    organizationSlug: organization.slug,
    event: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      startsAt: new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: organization.timezone,
      }).format(new Date(data.starts_at)),
      location:
        [data.venue_name, data.address].filter(Boolean).join(", ") ||
        "Location pending",
      status: data.status,
      resultStatus: data.result_status,
      isPublic: data.is_public,
      entriesOpenAt: data.entries_open_at,
      entriesCloseAt: data.entries_close_at,
      eventFees: (eventFeeData ?? []).map((fee) => ({
        id: fee.id,
        title: fee.title,
        amountCents: fee.amount_cents,
      })),
      divisions,
    },
  };
}

export default async function RopingDetailPage({
  params,
}: PageProps<"/ropings/[ropingId]">) {
  const { ropingId } = await params;
  const { event, organizationSlug } = await getEvent(ropingId);
  if (!event) notFound();
  const totalEntries = event.divisions.reduce(
    (sum, division) => sum + division.entries,
    0,
  );
  const totalFees =
    event.divisions
      .flatMap((division) => division.fees)
      .reduce((sum, fee) => sum + fee.amountCents, 0) +
    event.eventFees.reduce((sum, fee) => sum + fee.amountCents, 0);
  const roundsEditable = !["in_progress", "completed", "cancelled"].includes(
    event.status,
  );
  const roundAction = updateRopingRounds.bind(null, event.id);
  const spacingAction = updateClassEntrySpacing.bind(null, event.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roping workspace"
        title={event.title}
        description={`${event.startsAt} · ${event.location}`}
        actions={
          <>
            <Link
              href={`/public/${organizationSlug}`}
              className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white"
              aria-label="View public page"
            >
              <ExternalLink size={17} />
            </Link>
            {isSupabaseConfigured() ? (
              <>
                <Link
                  href={`/ropings/${event.id}/entries`}
                  className="flex h-10 items-center rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"
                >
                  Entries
                </Link>
                <Link
                  href={`/ropings/${event.id}/payouts`}
                  className="flex h-10 items-center rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"
                >
                  Payouts
                </Link>
              </>
            ) : null}
            <Link
              href={
                event.status === "in_progress"
                  ? isSupabaseConfigured()
                    ? `/ropings/${event.id}/live`
                    : "/ropings/current"
                  : "#setup"
              }
              className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
            >
              <Settings2 size={16} />
              {event.status === "in_progress"
                ? "Open event desk"
                : "Event setup"}
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={event.status} />
        <span className="text-xs font-semibold text-[#758078]">
          Results: {event.resultStatus}
        </span>
        <span
          className={`text-xs font-semibold ${event.isPublic ? "text-emerald-700" : "text-[#758078]"}`}
        >
          {event.isPublic ? "Published" : "Private"}
        </span>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CalendarDays}
          label="Event date"
          value={event.startsAt.split(" at ")[0]}
        />
        <Metric icon={Users} label="Entries" value={String(totalEntries)} />
        <Metric
          icon={ClipboardList}
          label="Classes"
          value={String(event.divisions.length)}
        />
        <Metric
          icon={CircleDollarSign}
          label="Configured fees"
          value={formatCurrency(totalFees)}
        />
      </section>
      {event.eventFees.length ? (
        <section className="rounded-md border border-[#dfe4e1] bg-white p-5">
          <h2 className="font-bold">Event-wide charges</h2>
          <p className="mt-1 text-xs text-[#758078]">
            Assessed once per contestant across every class and day in this
            event.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {event.eventFees.map((fee) => (
              <span
                key={fee.id}
                className="rounded-md bg-[#f1f3f2] px-3 py-2 text-sm font-semibold"
              >
                {fee.title}: {formatCurrency(fee.amountCents)} once
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <section
        id="setup"
        className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
      >
        <div className="flex flex-col gap-4 border-b border-[#e7ebe8] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold">Class setup</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Main-round counts and short-round rules can vary by class.
            </p>
          </div>
          <form action={roundAction} className="flex items-end gap-2">
            <input type="hidden" name="divisionId" value="" />
            <label className="text-xs font-semibold text-[#66716b]">
              Main rounds for all
              <input
                name="roundCount"
                type="number"
                min="1"
                max="20"
                defaultValue="1"
                disabled={!roundsEditable || !isSupabaseConfigured()}
                className="mt-1 block h-9 w-20 rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm disabled:bg-[#f1f3f2]"
              />
            </label>
            <button
              disabled={!roundsEditable || !isSupabaseConfigured()}
              className="h-9 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold disabled:opacity-50"
            >
              Apply to all
            </button>
          </form>
        </div>
        <div className="divide-y divide-[#e7ebe8]">
          {event.divisions.map((division) => (
            <div key={division.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold">{division.name}</h3>
                  <p className="mt-1 text-sm text-[#66716b]">
                    {division.runs}{" "}
                    {division.runs === 1 ? "main round" : "main rounds"}
                    {division.shortRoundEnabled ? " + short round" : ""} ·{" "}
                    {division.entries} entries
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#758078]">
                    {division.scheduleType === "follows_previous"
                      ? `${division.scheduledDate} · Follows previous roping`
                      : `${division.startsAt ?? division.scheduledDate}${
                          division.scheduleType === "tentative"
                            ? " · Tentative"
                            : ""
                        }`}
                  </p>
                  {division.scheduleNote ? (
                    <p className="mt-1 text-xs text-[#758078]">
                      {division.scheduleNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <ClassScheduleDialog
                    ropingId={event.id}
                    divisionId={division.id}
                    name={division.name}
                    scheduledDate={division.scheduledDateValue}
                    scheduleType={division.scheduleType}
                    startTime={division.startTime}
                    scheduleNote={division.scheduleNote}
                    editable={roundsEditable && isSupabaseConfigured()}
                  />
                  <form action={roundAction} className="flex items-end gap-2">
                    <input
                      type="hidden"
                      name="divisionId"
                      value={division.id}
                    />
                    <label className="text-xs font-semibold text-[#66716b]">
                      Main rounds
                      <input
                        name="roundCount"
                        type="number"
                        min="1"
                        max="20"
                        defaultValue={division.runs}
                        disabled={!roundsEditable || !isSupabaseConfigured()}
                        className="mt-1 block h-9 w-20 rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm disabled:bg-[#f1f3f2]"
                      />
                    </label>
                    <button
                      disabled={!roundsEditable || !isSupabaseConfigured()}
                      className="h-9 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      Save
                    </button>
                  </form>
                  <form action={spacingAction} className="flex items-end gap-2">
                    <input
                      type="hidden"
                      name="divisionId"
                      value={division.id}
                    />
                    <label className="text-xs font-semibold text-[#66716b]">
                      Runs between repeat entries
                      <input
                        name="minimumRunsBetweenEntries"
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={division.minimumRunsBetweenEntries}
                        disabled={!roundsEditable || !isSupabaseConfigured()}
                        className="mt-1 block h-9 w-20 rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm disabled:bg-[#f1f3f2]"
                      />
                    </label>
                    <button
                      disabled={!roundsEditable || !isSupabaseConfigured()}
                      className="h-9 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      Save
                    </button>
                  </form>
                </div>
              </div>
              <ClassRoundOrderingForm
                ropingId={event.id}
                divisionId={division.id}
                roundCount={division.runs}
                secondRoundOrdering={division.secondRoundOrdering}
                laterRoundOrdering={division.laterRoundOrdering}
                editable={roundsEditable && isSupabaseConfigured()}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {division.fees.map((fee) => (
                  <span
                    key={fee.id}
                    className="rounded-md bg-[#f1f3f2] px-3 py-2 text-xs font-medium"
                  >
                    {fee.title}: {formatCurrency(fee.amountCents)}
                    {fee.included ? " included" : " separate"}
                  </span>
                ))}
              </div>
              {division.incentiveEnabled ? (
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                    <Gauge size={16} /> Incentive handicaps
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {division.incentiveRules.map((rule) => (
                      <span
                        key={rule.id}
                        className="rounded-md bg-white px-2 py-1 text-xs font-semibold"
                      >
                        {rule.classification}:{" "}
                        <span className="font-mono text-emerald-700">
                          {formatFinalTimeAdjustment(rule.adjustmentSeconds)}{" "}
                          sec
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <ShortRoundSettingsForm
                ropingId={event.id}
                divisionId={division.id}
                enabled={division.shortRoundEnabled}
                brackets={division.shortRoundBrackets}
                editable={roundsEditable && isSupabaseConfigured()}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-[#dfe4e1] bg-white p-5">
          <h2 className="font-bold">Entry window</h2>
          <p className="mt-3 text-sm text-[#66716b]">
            {event.entriesOpenAt
              ? "Online entries have a configured opening time."
              : "Online entry opening time is not set."}
          </p>
          <p className="mt-2 text-sm text-[#66716b]">
            {event.entriesCloseAt
              ? "Online entries have a configured closing time."
              : "Online entry closing time is not set."}
          </p>
        </div>
        <div className="rounded-md border border-[#dfe4e1] bg-white p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <MapPin size={17} className="text-[var(--brand-accent-strong)]" />{" "}
            Public listing
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#66716b]">
            {event.isPublic
              ? "This roping appears on the organization’s public schedule. Draw and results publication remain separately controlled."
              : "This roping is private and does not appear on the public schedule."}
          </p>
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex items-center gap-2 text-[#66716b]">
        <Icon size={16} />
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
