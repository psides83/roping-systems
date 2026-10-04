import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  ExternalLink,
  Gauge,
  ListChecks,
  MapPin,
  Radio,
  Settings2,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import type { ShortRoundTiePolicy } from "@/components/events/short-round-settings";
import { ClassScheduleDialog } from "@/components/events/class-schedule-dialog";
import { ClassRoundOrderingForm } from "@/components/events/class-round-ordering-form";
import { EventDetailsDialog } from "@/components/events/event-details-dialog";
import {
  ClassOperationsDialog,
  classEventDayStatusLabels,
  type ClassEventDayStatus,
} from "@/components/events/class-operations-dialog";
import {
  AddEventRopingDialog,
  RemoveEventRopingDialog,
  type AddRopingClassification,
  type AddRopingTemplate,
} from "@/components/events/event-schedule-roster";
import {
  events as demoRopings,
  divisionTemplates as demoDivisions,
} from "@/data/demo";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { formatFinalTimeAdjustment } from "@/lib/scoring";
import type { RoundOrderMethod } from "@/types/domain";
import { updateClassEntrySpacing } from "./actions";

interface EventDetail {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  startsAtValue: string;
  endsAtValue: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  arenaCount: number;
  location: string;
  status: string;
  resultStatus: string;
  isPublic: boolean;
  publicationState: "draft" | "published" | "unpublished";
  entriesOpenAt: string | null;
  entriesCloseAt: string | null;
  entriesOpenAtValue: string;
  entriesCloseAtValue: string;
  defaultScheduleDate: string;
  finalScheduleDate: string;
  canManage: boolean;
  availableTemplates: AddRopingTemplate[];
  availableClassifications: AddRopingClassification[];
  eventFees: Array<{
    id: string;
    title: string;
    amountCents: number;
  }>;
  pendingOnlineEntries: number;
  unpaidEntries: number;
  completedRuns: number;
  totalRuns: number;
  payoutTotalCents: number;
  payoutCompletedCents: number;
  divisions: Array<{
    id: string;
    name: string;
    runs: number;
    minimumRunsBetweenEntries: number;
    secondRoundOrdering: RoundOrderMethod;
    laterRoundOrdering: RoundOrderMethod;
    cattleDrawEnabled: boolean;
    arenaName: string | null;
    eventDayStatus: ClassEventDayStatus;
    estimatedStart: string;
    eventDayNote: string | null;
    entries: number;
    currentRound: number;
    remainingEntries: number;
    startsAt: string | null;
    scheduledDate: string;
    scheduledDateValue: string;
    startTime: string;
    scheduleType: "fixed" | "tentative" | "follows_previous";
    followsRopingName: string | null;
    scheduleNote: string | null;
    incentiveEnabled: boolean;
    incentiveRules: Array<{
      id: string;
      classification: string;
      adjustmentSeconds: number;
    }>;
    shortRoundEnabled: boolean;
    shortRoundTiePolicy: ShortRoundTiePolicy;
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

function toLocalDateTimeInput(value: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function getEvent(
  eventId: string,
): Promise<{ event: EventDetail | null; producerSlug: string }> {
  if (!isSupabaseConfigured()) {
    const roping = demoRopings.find((item) => item.id === eventId);
    if (!roping)
      return { event: null, producerSlug: "red-river-calf-ropers" };
    return {
      producerSlug: "red-river-calf-ropers",
      event: {
        id: roping.id,
        title: roping.title,
        slug: roping.id,
        startsAt: roping.date,
        startsAtValue: "2026-09-27T09:00",
        endsAtValue: "2026-09-27T18:00",
        venueName: roping.location,
        address: "",
        city: "",
        state: "",
        postalCode: "",
        arenaCount: 2,
        location: roping.location,
        status: roping.status,
        resultStatus: roping.resultStatus ?? "unofficial",
        isPublic: true,
        publicationState: "published",
        entriesOpenAt: null,
        entriesCloseAt: null,
        entriesOpenAtValue: "",
        entriesCloseAtValue: "",
        defaultScheduleDate: "2026-09-27",
        finalScheduleDate: "2026-09-27",
        canManage: false,
        availableTemplates: [],
        availableClassifications: [],
        eventFees: [
          { id: "preview-office", title: "Office charge", amountCents: 2000 },
        ],
        pendingOnlineEntries: 4,
        unpaidEntries: 7,
        completedRuns: 84,
        totalRuns: 126,
        payoutTotalCents: 134000,
        payoutCompletedCents: 90500,
        divisions: demoDivisions
          .slice(0, roping.divisions)
          .map((division, index) => ({
            id: division.id,
            name: division.name,
            runs: index === 2 ? 2 : 1,
            minimumRunsBetweenEntries: index === 1 ? 3 : 0,
            secondRoundOrdering: "reverse_first",
            laterRoundOrdering: "aggregate_slowest_to_fastest",
            cattleDrawEnabled: false,
            arenaName: index % 2 === 0 ? "Arena 1" : "Arena 2",
            eventDayStatus: "scheduled",
            estimatedStart: "",
            eventDayNote: null,
            entries: index === 0 ? roping.entries : 0,
            currentRound: index === 0 ? 2 : 1,
            remainingEntries: index === 0 ? 12 : 0,
            startsAt: null,
            scheduledDate: roping.date,
            scheduledDateValue: "2026-09-27",
            startTime: index === 0 ? "09:00" : "",
            scheduleType: index === 2 ? "follows_previous" : "fixed",
            followsRopingName:
              index === 2 ? (demoDivisions[1]?.name ?? null) : null,
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
            shortRoundTiePolicy: "advance_all",
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

  const producer = await getActiveProducer();
  if (!producer) return { event: null, producerSlug: "" };
  const supabase = await createClient();
  const [
    { data, error },
    { data: eventFeeData, error: eventFeeError },
    { data: templateData, error: templateError },
    { data: classificationData, error: classificationError },
    { data: entryData, error: entryError },
    { count: pendingOnlineEntries, error: requestError },
    { data: runData, error: runError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, slug, starts_at, ends_at, venue_name, address, venue_city, venue_state, venue_postal_code, arena_count, publication_state, status, result_status, is_public, entries_open_at, entries_close_at, event_ropings(id, name, starts_at, scheduled_date, schedule_type, schedule_note, sort_order, main_round_count, minimum_positions_between_entries, second_round_ordering, later_round_ordering, cattle_draw_enabled, arena_name, event_day_status, estimated_starts_at, event_day_note, incentive_enabled, short_round_enabled, short_round_tie_policy, entries:roping_entries(id), event_roping_handicap_adjustments(id, handicap_time_credit_seconds, classifications!inner(name)), event_roping_short_round_brackets(minimum_entries, maximum_entries, comeback_count, sort_order), event_fees(id, title, amount_cents, included_in_entry_price))",
      )
      .eq("id", eventId)
      .eq("producer_id", producer.id)
      .single(),
    supabase
      .from("event_fees")
      .select("id, title, amount_cents")
      .eq("event_id", eventId)
      .eq("producer_id", producer.id)
      .is("event_roping_id", null),
    supabase
      .from("roping_templates")
      .select("id, name, division_id, competition_format, divisions(name)")
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("classifications")
      .select("id, name, division_id:discipline_id, standalone_enabled")
      .eq("organization_id", producer.id)
      .eq("is_active", true)
      .order("rank", { ascending: false }),
    supabase
      .from("roping_entries")
      .select("id, event_roping_id, payment_status, competition_status")
      .eq("event_id", eventId),
    supabase
      .from("online_entry_submissions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("producer_id", producer.id)
      .eq("status", "pending"),
    supabase
      .from("competition_runs")
      .select(
        "entry_id, event_roping_id, round_number, status, event_ropings!inner(event_id)",
      )
      .eq("event_ropings.event_id", eventId)
      .eq("producer_id", producer.id),
  ]);
  if (error || !data)
    return { event: null, producerSlug: producer.slug };
  if (eventFeeError)
    throw new Error(`Unable to load event charges: ${eventFeeError.message}`);
  if (templateError || classificationError)
    throw new Error("Unable to load the available roping setup.");
  if (entryError || requestError || runError)
    throw new Error("Unable to load the event dashboard status.");
  const activeEntries = (entryData ?? []).filter(
    (entry) => entry.competition_status === "active",
  );
  const runs = (runData ?? []) as Array<{
    entry_id: string;
    event_roping_id: string;
    round_number: number;
    status:
      | "pending"
      | "complete"
      | "no_time"
      | "scratch"
      | "rerun"
      | "disqualified"
      | "turned_out";
  }>;
  const completedRunStatuses = new Set([
    "complete",
    "no_time",
    "scratch",
    "disqualified",
    "turned_out",
  ]);
  const divisions = (
    data.event_ropings as unknown as Array<{
      id: string;
      name: string;
      main_round_count: number;
      minimum_positions_between_entries: number;
      second_round_ordering: RoundOrderMethod;
      later_round_ordering: RoundOrderMethod;
      cattle_draw_enabled: boolean;
      arena_name: string | null;
      event_day_status: ClassEventDayStatus;
      estimated_starts_at: string | null;
      event_day_note: string | null;
      short_round_enabled: boolean;
      short_round_tie_policy: ShortRoundTiePolicy;
      starts_at: string | null;
      scheduled_date: string;
      schedule_type: "fixed" | "tentative" | "follows_previous";
      schedule_note: string | null;
      sort_order: number;
      incentive_enabled: boolean;
      entries: unknown[];
      event_roping_handicap_adjustments: Array<{
        id: string;
        handicap_time_credit_seconds: number;
        classifications: { name: string };
      }>;
      event_roping_short_round_brackets: Array<{
        minimum_entries: number;
        maximum_entries: number | null;
        comeback_count: number;
        sort_order: number;
      }>;
      event_fees: Array<{
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
    .map((division, index, orderedDivisions) => {
      const divisionRuns = runs.filter(
        (run) => run.event_roping_id === division.id,
      );
      const incompleteRuns = divisionRuns.filter(
        (run) => !completedRunStatuses.has(run.status),
      );
      const currentRound =
        incompleteRuns.length > 0
          ? Math.min(...incompleteRuns.map((run) => run.round_number))
          : Math.max(1, ...divisionRuns.map((run) => run.round_number));
      const remainingEntries = new Set(
        incompleteRuns
          .filter((run) => run.round_number === currentRound)
          .map((run) => run.entry_id),
      ).size;

      return {
        id: division.id,
        name: division.name,
        runs: division.main_round_count,
        minimumRunsBetweenEntries: division.minimum_positions_between_entries,
        secondRoundOrdering: division.second_round_ordering,
        laterRoundOrdering: division.later_round_ordering,
        cattleDrawEnabled: division.cattle_draw_enabled,
        arenaName: division.arena_name,
        eventDayStatus: division.event_day_status,
        estimatedStart: division.estimated_starts_at
          ? toLocalDateTimeInput(
              division.estimated_starts_at,
              producer.timezone,
            )
          : "",
        eventDayNote: division.event_day_note,
        entries: activeEntries.filter(
          (entry) => entry.event_roping_id === division.id,
        ).length,
        currentRound,
        remainingEntries,
        startsAt: division.starts_at
          ? new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: producer.timezone,
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
              timeZone: producer.timezone,
            }).format(new Date(division.starts_at))
          : "",
        scheduleType: division.schedule_type,
        followsRopingName:
          division.schedule_type === "follows_previous"
            ? (orderedDivisions
                .slice(0, index)
                .findLast(
                  (previous) =>
                    previous.scheduled_date === division.scheduled_date &&
                    previous.arena_name === division.arena_name,
                )?.name ?? null)
            : null,
        scheduleNote: division.schedule_note,
        incentiveEnabled: division.incentive_enabled,
        incentiveRules: division.event_roping_handicap_adjustments.map((rule) => ({
          id: rule.id,
          classification: rule.classifications.name,
          adjustmentSeconds: Number(rule.handicap_time_credit_seconds),
        })),
        shortRoundEnabled: division.short_round_enabled,
        shortRoundTiePolicy: division.short_round_tie_policy,
        shortRoundBrackets: division.event_roping_short_round_brackets
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((bracket) => ({
            minimumEntries: bracket.minimum_entries,
            maximumEntries: bracket.maximum_entries,
            comebackCount: bracket.comeback_count,
          })),
        fees: division.event_fees.map((fee) => ({
          id: fee.id,
          title: fee.title,
          amountCents: fee.amount_cents,
          included: fee.included_in_entry_price,
        })),
      };
    });

  let payoutTotalCents = 0;
  let payoutCompletedCents = 0;
  if (data.status === "completed") {
    const [{ data: payoutPlans, error: payoutPlanError }, payoutPayments] =
      await Promise.all([
        supabase
          .from("event_roping_payout_plans")
          .select("id, pool_type, event_ropings!inner(competition_format)")
          .eq("event_id", eventId)
          .eq("producer_id", producer.id),
        supabase
          .from("payout_disbursements")
          .select("amount_cents")
          .eq("roping_id", eventId)
          .eq("organization_id", producer.id),
      ]);
    if (payoutPlanError || payoutPayments.error)
      throw new Error("Unable to load the event payout status.");

    const payoutResults = await Promise.all(
      (payoutPlans ?? []).map((plan) => {
        const division = plan.event_ropings as unknown as {
          competition_format: "standard" | "handicap" | "four_d";
        };
        return supabase.rpc(
          division.competition_format === "four_d" && plan.pool_type === "main"
            ? "calculate_four_d_payout_results"
            : "calculate_roping_payout_results",
          { target_plan_id: plan.id },
        );
      }),
    );
    for (const result of payoutResults) {
      if (result.error)
        throw new Error("Unable to calculate the event payout status.");
      payoutTotalCents += (
        (result.data ?? []) as Array<{ payout_cents: number | string }>
      ).reduce((total, award) => total + Number(award.payout_cents), 0);
    }
    payoutCompletedCents = (payoutPayments.data ?? []).reduce(
      (total, payment) => total + payment.amount_cents,
      0,
    );
  }
  return {
    producerSlug: producer.slug,
    event: {
      id: data.id,
      title: data.title,
      slug: data.slug,
      startsAt: new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: producer.timezone,
      }).format(new Date(data.starts_at)),
      startsAtValue: toLocalDateTimeInput(
        data.starts_at,
        producer.timezone,
      ),
      endsAtValue: data.ends_at
        ? toLocalDateTimeInput(data.ends_at, producer.timezone)
        : "",
      venueName: data.venue_name ?? "",
      address: data.address ?? "",
      city: data.venue_city ?? "",
      state: data.venue_state ?? "",
      postalCode: data.venue_postal_code ?? "",
      arenaCount: data.arena_count,
      location:
        [
          data.venue_name,
          data.venue_city,
          [data.venue_state, data.venue_postal_code].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join(", ") || "Location pending",
      status: data.status,
      resultStatus: data.result_status,
      isPublic: data.is_public,
      publicationState: data.publication_state,
      entriesOpenAt: data.entries_open_at,
      entriesCloseAt: data.entries_close_at,
      entriesOpenAtValue: data.entries_open_at
        ? toLocalDateTimeInput(data.entries_open_at, producer.timezone)
        : "",
      entriesCloseAtValue: data.entries_close_at
        ? toLocalDateTimeInput(data.entries_close_at, producer.timezone)
        : "",
      defaultScheduleDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: producer.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(data.starts_at)),
      finalScheduleDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: producer.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(data.ends_at ?? data.starts_at)),
      canManage: producer.role !== "viewer",
      availableTemplates: (templateData ?? []).map((template) => ({
        id: template.id,
        name: template.name,
        disciplineId: template.division_id,
        divisionName:
          (template.divisions as unknown as { name: string } | null)?.name ??
          "Unassigned division",
        competitionFormat: template.competition_format,
      })),
      availableClassifications: (classificationData ?? []).map(
        (classification) => ({
          id: classification.id,
          name: classification.name,
          disciplineId: classification.division_id,
          standaloneEnabled: classification.standalone_enabled,
        }),
      ),
      eventFees: (eventFeeData ?? []).map((fee) => ({
        id: fee.id,
        title: fee.title,
        amountCents: fee.amount_cents,
      })),
      pendingOnlineEntries: pendingOnlineEntries ?? 0,
      unpaidEntries: activeEntries.filter(
        (entry) => entry.payment_status === "unpaid",
      ).length,
      completedRuns: runs.filter((run) => completedRunStatuses.has(run.status))
        .length,
      totalRuns: runs.length,
      payoutTotalCents,
      payoutCompletedCents,
      divisions,
    },
  };
}

export default async function RopingDetailPage({
  params,
}: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  const { event, producerSlug } = await getEvent(eventId);
  if (!event) notFound();
  const totalEntries = event.divisions.reduce(
    (sum, division) => sum + division.entries,
    0,
  );
  const setupEditable =
    event.canManage &&
    !["in_progress", "completed", "cancelled"].includes(event.status);
  const roundsEditable = setupEditable;
  const operationsEditable =
    event.canManage && !["completed", "cancelled"].includes(event.status);
  const spacingAction = updateClassEntrySpacing.bind(null, event.id);
  const activeRoping =
    event.divisions.find(
      (division) => division.eventDayStatus === "in_progress",
    ) ??
    event.divisions.find((division) => division.eventDayStatus === "holding") ??
    null;
  const activeRopingIndex = activeRoping
    ? event.divisions.findIndex((division) => division.id === activeRoping.id)
    : -1;
  const nextRoping =
    event.divisions
      .slice(activeRopingIndex + 1)
      .find(
        (division) =>
          !["completed", "in_progress"].includes(division.eventDayStatus),
      ) ?? null;
  const firstScheduledRoping =
    event.divisions.find(
      (division) =>
        division.eventDayStatus !== "completed" &&
        division.scheduleType !== "follows_previous",
    ) ??
    event.divisions.find((division) => division.eventDayStatus !== "completed");
  const dashboardMetrics = getDashboardMetrics({
    event,
    totalEntries,
    activeRoping,
    nextRoping,
    firstScheduledRoping,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-[#66716b]"
        >
          <Link href="/events" className="font-semibold hover:text-[#17201c]">
            Events
          </Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="max-w-64 truncate" aria-current="page">
            {event.title}
          </span>
        </nav>
        <Link
          href="/events"
          className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold hover:bg-[#f7f8f7]"
        >
          <ArrowLeft size={15} /> Back to events
        </Link>
      </div>
      <PageHeader
        eyebrow="Roping workspace"
        title={event.title}
        description={`${event.startsAt} · ${event.location}`}
        actions={
          <>
            <Link
              href={`/public/${producerSlug}`}
              className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white"
              aria-label="View public page"
            >
              <ExternalLink size={17} />
            </Link>
            {isSupabaseConfigured() ? (
              <>
                <EventDetailsDialog
                  event={{
                    id: event.id,
                    title: event.title,
                    slug: event.slug,
                    venueName: event.venueName,
                    address: event.address,
                    city: event.city,
                    state: event.state,
                    postalCode: event.postalCode,
                    arenaCount: event.arenaCount,
                    startsAt: event.startsAtValue,
                    endsAt: event.endsAtValue,
                    entriesOpenAt: event.entriesOpenAtValue,
                    entriesCloseAt: event.entriesCloseAtValue,
                    publicationState: event.publicationState,
                    eventFee: event.eventFees[0]
                      ? {
                          id: event.eventFees[0].id,
                          title: event.eventFees[0].title,
                          amount: (
                            event.eventFees[0].amountCents / 100
                          ).toFixed(2),
                        }
                      : null,
                  }}
                  editable={setupEditable}
                />
                <Link
                  href={`/events/${event.id}/entries`}
                  className="flex h-10 items-center rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"
                >
                  Entries
                </Link>
                <Link
                  href={`/events/${event.id}/payouts`}
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
                    ? `/events/${event.id}/live`
                    : "/events/current"
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
          {event.publicationState === "published"
            ? "Published"
            : event.publicationState === "draft"
              ? "Draft"
              : "Unpublished"}
        </span>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <Metric key={metric.label} {...metric} />
        ))}
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
      <section id="setup" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Scheduled events</h2>
            <p className="mt-1 text-sm text-[#66716b]">
              {event.divisions.length} roping
              {event.divisions.length === 1 ? "" : "s"} in this event
            </p>
          </div>
          <AddEventRopingDialog
            eventId={event.id}
            templates={event.availableTemplates}
            classifications={event.availableClassifications}
            defaultDate={event.defaultScheduleDate}
            finalDate={event.finalScheduleDate}
            arenaCount={event.arenaCount}
            existingRopings={event.divisions.map((division) => ({
              name: division.name,
              scheduledDate: division.scheduledDateValue,
              arenaName: division.arenaName,
            }))}
            enabled={setupEditable && isSupabaseConfigured()}
          />
        </div>

        <div className="space-y-3">
          {event.divisions.map((division, index) => (
            <details
              key={division.id}
              className="group overflow-hidden rounded-md border border-[#dfe4e1] bg-white open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:items-center">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#f1f3f2] font-mono text-xs font-bold text-[#66716b]">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="font-bold">{division.name}</h3>
                    {division.eventDayStatus !== "scheduled" ? (
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        {classEventDayStatusLabels[division.eventDayStatus]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#66716b]">
                    {division.scheduleType === "follows_previous"
                      ? `${division.scheduledDate} · Follows ${division.followsRopingName ?? "previous roping"}`
                      : `${division.startsAt ?? division.scheduledDate}${
                          division.scheduleType === "tentative"
                            ? " · Tentative"
                            : ""
                        }`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#758078]">
                    {division.arenaName ? (
                      <span>{division.arenaName}</span>
                    ) : null}
                    <span>
                      {division.runs} {division.runs === 1 ? "round" : "rounds"}
                      {division.shortRoundEnabled ? " + short round" : ""}
                    </span>
                    <span>
                      {division.entries}{" "}
                      {division.entries === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-[#758078] transition-transform group-open:rotate-180 sm:mt-0"
                />
              </summary>

              <div className="border-t border-[#e7ebe8]">
                <div className="flex flex-col gap-3 bg-[#f7f8f7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#758078]">
                      Schedule and event day
                    </p>
                    {division.eventDayNote || division.scheduleNote ? (
                      <p className="mt-1 truncate text-xs text-[#66716b]">
                        {division.eventDayNote ?? division.scheduleNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ClassScheduleDialog
                      eventId={event.id}
                      divisionId={division.id}
                      name={division.name}
                      scheduledDate={division.scheduledDateValue}
                      scheduleType={division.scheduleType}
                      startTime={division.startTime}
                      scheduleNote={division.scheduleNote}
                      followsRopingName={division.followsRopingName}
                      editable={roundsEditable && isSupabaseConfigured()}
                    />
                    <ClassOperationsDialog
                      eventId={event.id}
                      divisionId={division.id}
                      className={division.name}
                      arenaName={division.arenaName}
                      arenaCount={event.arenaCount}
                      status={division.eventDayStatus}
                      estimatedStart={division.estimatedStart}
                      note={division.eventDayNote}
                      editable={operationsEditable && isSupabaseConfigured()}
                      compact
                    />
                  </div>
                </div>

                <div className="px-4 py-5">
                  <h4 className="text-sm font-bold">Roping format</h4>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#56615b]">
                    <span className="rounded-md bg-[#f1f3f2] px-3 py-2">
                      {division.runs} {division.runs === 1 ? "round" : "rounds"}
                    </span>
                    <span className="rounded-md bg-[#f1f3f2] px-3 py-2">
                      {division.cattleDrawEnabled
                        ? "Drawn cattle"
                        : "Cattle run in order"}
                    </span>
                    <span className="rounded-md bg-[#f1f3f2] px-3 py-2">
                      Short round:{" "}
                      {division.shortRoundEnabled ? "Included" : "Not included"}
                    </span>
                  </div>
                  <div className="mt-4 max-w-xl">
                    <form
                      action={spacingAction}
                      className="flex items-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="divisionId"
                        value={division.id}
                      />
                      <label className="min-w-0 flex-1 text-xs font-semibold text-[#66716b]">
                        Runs between repeat entries
                        <input
                          name="minimumRunsBetweenEntries"
                          type="number"
                          min="0"
                          max="100"
                          defaultValue={division.minimumRunsBetweenEntries}
                          disabled={!roundsEditable || !isSupabaseConfigured()}
                          className="mt-1 block h-10 w-full rounded-md border border-[#ccd4d0] px-3 font-mono text-sm disabled:bg-[#f1f3f2]"
                        />
                      </label>
                      <button
                        disabled={!roundsEditable || !isSupabaseConfigured()}
                        className="h-10 rounded-md border border-[#d7ddda] px-4 text-xs font-semibold disabled:opacity-50"
                      >
                        Save
                      </button>
                    </form>
                  </div>
                </div>

                <div className="border-t border-[#e7ebe8] px-4 py-5">
                  <h4 className="text-sm font-bold">Competition order</h4>
                  <div className="mt-3">
                    <ClassRoundOrderingForm
                      eventId={event.id}
                      divisionId={division.id}
                      roundCount={division.runs}
                      secondRoundOrdering={division.secondRoundOrdering}
                      laterRoundOrdering={division.laterRoundOrdering}
                      editable={roundsEditable && isSupabaseConfigured()}
                      embedded
                    />
                  </div>
                </div>

                <div className="border-t border-[#e7ebe8] px-4 py-5">
                  <h4 className="text-sm font-bold">Entry fees</h4>
                  {division.fees.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                  ) : (
                    <p className="mt-2 text-xs text-[#758078]">
                      No entry fees configured.
                    </p>
                  )}
                </div>

                {division.incentiveEnabled ? (
                  <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-5">
                    <p className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                      <Gauge size={16} /> Incentive handicaps
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
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

                <div className="flex justify-end border-t border-[#e7ebe8] px-4 py-3">
                  <RemoveEventRopingDialog
                    eventId={event.id}
                    divisionId={division.id}
                    name={division.name}
                    entryCount={division.entries}
                    enabled={
                      setupEditable &&
                      !["in_progress", "completed"].includes(
                        division.eventDayStatus,
                      ) &&
                      isSupabaseConfigured()
                    }
                    showLabel
                  />
                </div>
              </div>
            </details>
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
              ? "This roping appears on the producer’s public schedule. Draw and results publication remain separately controlled."
              : "This roping is private and does not appear on the public schedule."}
          </p>
        </div>
      </section>
    </div>
  );
}

type EventRoping = EventDetail["divisions"][number];

function ropingScheduleLabel(roping: EventRoping | null | undefined) {
  if (!roping) return "Not scheduled";
  if (roping.scheduleType === "follows_previous") {
    return `Follows ${roping.followsRopingName ?? "previous roping"}`;
  }
  return roping.startsAt ?? roping.scheduledDate;
}

function getDashboardMetrics({
  event,
  totalEntries,
  activeRoping,
  nextRoping,
  firstScheduledRoping,
}: {
  event: EventDetail;
  totalEntries: number;
  activeRoping: EventRoping | null;
  nextRoping: EventRoping | null;
  firstScheduledRoping: EventRoping | undefined;
}): Array<{
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}> {
  if (event.status === "completed") {
    const payoutRemaining = Math.max(
      event.payoutTotalCents - event.payoutCompletedCents,
      0,
    );
    return [
      {
        icon: CircleDollarSign,
        label: "Payouts due",
        value: formatCurrency(event.payoutTotalCents),
        detail: "Total awarded",
      },
      {
        icon: BadgeCheck,
        label: "Payouts completed",
        value: formatCurrency(event.payoutCompletedCents),
        detail: "Marked paid",
      },
      {
        icon: ListChecks,
        label: "Results",
        value: event.resultStatus === "official" ? "Official" : "Unofficial",
        detail: `${event.completedRuns} runs recorded`,
      },
      {
        icon: WalletCards,
        label: "Payouts remaining",
        value: formatCurrency(payoutRemaining),
        detail: payoutRemaining === 0 ? "All payouts complete" : "Still to pay",
      },
    ];
  }

  if (event.status === "in_progress") {
    return [
      {
        icon: Radio,
        label: "Current roping",
        value: activeRoping?.name ?? "Not selected",
        detail: activeRoping ? `Round ${activeRoping.currentRound}` : undefined,
      },
      {
        icon: Clock3,
        label: "Next roping",
        value: nextRoping?.name ?? "None remaining",
        detail: nextRoping ? ropingScheduleLabel(nextRoping) : undefined,
      },
      {
        icon: Users,
        label: "Remaining entries",
        value: String(activeRoping?.remainingEntries ?? 0),
        detail: activeRoping ? "In the current round" : "No active roping",
      },
      {
        icon: ListChecks,
        label: "Runs completed",
        value: `${event.completedRuns} of ${event.totalRuns}`,
        detail: `${Math.max(event.totalRuns - event.completedRuns, 0)} runs remaining`,
      },
    ];
  }

  return [
    {
      icon: Users,
      label: "Entries",
      value: String(totalEntries),
      detail: `${event.divisions.length} scheduled events`,
    },
    {
      icon: CircleDollarSign,
      label: "Unpaid entries",
      value: String(event.unpaidEntries),
      detail:
        event.unpaidEntries === 0 ? "Entry balances are clear" : "Need payment",
    },
    {
      icon: Clock3,
      label: "Next scheduled start",
      value: ropingScheduleLabel(firstScheduledRoping),
      detail: firstScheduledRoping?.name,
    },
    {
      icon: ClipboardList,
      label: "Pending entries",
      value: String(event.pendingOnlineEntries),
      detail:
        event.pendingOnlineEntries === 0
          ? "Online requests are clear"
          : "Awaiting review",
    },
  ];
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex items-center gap-2 text-[#66716b]">
        <Icon size={16} />
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold">{value}</p>
      {detail ? (
        <p className="mt-1 truncate text-xs font-medium text-[#758078]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
