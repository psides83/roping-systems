import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Radio,
} from "lucide-react";
import { PublicResultsRefresh } from "@/components/public-results-refresh";
import {
  FourDStandings,
  mapFourDResult,
  type FourDResultDatabaseRow,
  type FourDResultRow,
} from "@/components/events/four-d-standings";
import { events as demoRopings } from "@/data/demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getBrandStyle } from "@/lib/branding";
import { PublicRopingResults } from "@/components/events/public-roping-results";
import type { PublicResult, PublicRoundResult } from "@/lib/events/public-standings";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  venue: string;
  address: string;
  status: string;
  resultStatus: string;
  entriesOpenAt: string | null;
  entriesCloseAt: string | null;
  scheduledRopings: Array<{
    id: string;
    name: string;
    scheduledDate: string;
    startsAt: string | null;
    scheduleType: "fixed" | "tentative" | "follows_previous";
    followsRopingName: string | null;
    scheduleNote: string | null;
    arenaName: string | null;
    eventDayStatus: string;
    estimatedStartsAt: string | null;
    eventDayNote: string | null;
  }>;
}


interface PublicFourDResult extends FourDResultRow {
  divisionId: string;
  divisionName: string;
  resultStatus: string;
}


async function getPublicData(producerSlug: string) {
  if (!isSupabaseConfigured()) {
    const events: PublicEvent[] = demoRopings.map((event) => ({
      id: event.id,
      title: event.title,
      slug: event.id,
      startsAt: event.date,
      venue: event.location.split(",")[0],
      address: event.location.split(",").slice(1).join(",").trim(),
      status: event.status,
      resultStatus: event.resultStatus ?? "unofficial",
      entriesOpenAt: null,
      entriesCloseAt: null,
      scheduledRopings: [
        {
          id: `${event.id}-1`,
          name: "Calf roping · Open",
          scheduledDate: event.date,
          startsAt: "9:00 AM",
          scheduleType: "fixed",
          followsRopingName: null,
          scheduleNote: null,
          arenaName: "Arena 1",
          eventDayStatus: "scheduled",
          estimatedStartsAt: null,
          eventDayNote: null,
        },
        {
          id: `${event.id}-2`,
          name: "Breakaway · Open",
          scheduledDate: event.date,
          startsAt: null,
          scheduleType: "follows_previous",
          followsRopingName: "Calf roping · Open",
          scheduleNote: null,
          arenaName: "Arena 2",
          eventDayStatus: "delayed",
          estimatedStartsAt: null,
          eventDayNote: "Holding for arena preparation",
        },
      ],
    }));
    return {
      producer: {
        name: "Red River Calf Ropers",
        slug: producerSlug,
        logoUrl: null as string | null,
        brandPrimary: "#17251F",
        brandAccent: "#BB3E24",
      },
      events,
      results: [
        {
          resultId: "1",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Jace Holloway",
          entryNumber: 1,
          totalTime: 19.42,
          incentiveAdjustment: 0,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: true,
        },
        {
          resultId: "2",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Wyatt James",
          entryNumber: 1,
          totalTime: 19.71,
          incentiveAdjustment: 1.5,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: true,
        },
        {
          resultId: "3",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Mason Cole",
          entryNumber: 2,
          totalTime: 20.02,
          incentiveAdjustment: 1,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
        {
          resultId: "4",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Travis Dean",
          entryNumber: 1,
          totalTime: 20.31,
          incentiveAdjustment: 0,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
      ] as PublicResult[],
      fourDResults: [] as PublicFourDResult[],
      roundResults: [] as PublicRoundResult[],
      shortRoundRopingIds: [] as string[],
      membershipFormPublished: false,
    };
  }

  const supabase = await createClient();
  const { data: producer } = await supabase
    .from("public_producer_pages")
    .select("id, public_name, slug, logo_path, brand_primary, brand_accent")
    .eq("slug", producerSlug)
    .single();
  if (!producer) return null;
  const { data: membershipForm, error: membershipFormError } = await supabase
    .from("public_membership_forms")
    .select("id")
    .eq("producer_id", producer.id)
    .maybeSingle();
  if (membershipFormError)
    throw new Error(
      `Unable to load membership information: ${membershipFormError.message}`,
    );
  const { data: schedule, error: scheduleError } = await supabase
    .from("public_event_schedule")
    .select(
      "id, title, slug, venue_name, address, venue_city, venue_state, venue_postal_code, starts_at, entries_open_at, entries_close_at, status, result_status",
    )
    .eq("producer_id", producer.id)
    .order("starts_at", { ascending: false });
  if (scheduleError)
    throw new Error(
      `Unable to load the public schedule: ${scheduleError.message}`,
    );
  const { data: scheduleRows, error: classScheduleError } = await supabase
    .from("public_event_entry_options")
    .select(
      "event_id, event_roping_id, event_roping_name, event_roping_starts_at, scheduled_date, schedule_type, schedule_note, arena_name, event_day_status, estimated_starts_at, event_day_note, sort_order",
    )
    .eq("producer_slug", producerSlug)
    .order("scheduled_date")
    .order("sort_order");
  if (classScheduleError)
    throw new Error(
      `Unable to load the class schedule: ${classScheduleError.message}`,
    );
  const liveEvent =
    schedule.find((event) => event.status === "in_progress") ??
    schedule.find((event) => event.status === "completed");
  let results: PublicResult[] = [];
  const fourDResults: PublicFourDResult[] = [];
  let roundResults: PublicRoundResult[] = [];
  let shortRoundRopingIds: string[] = [];
  if (liveEvent) {
    const { data: formatRows, error: formatError } = await supabase
      .from("public_competition_formats")
      .select("event_roping_id, event_roping_name, competition_format, short_round_enabled")
      .eq("producer_slug", producerSlug)
      .eq("event_id", liveEvent.id);
    if (formatError)
      throw new Error(
        `Unable to load competition formats: ${formatError.message}`,
      );
    shortRoundRopingIds = (formatRows ?? []).filter((row) => row.short_round_enabled).map((row) => row.event_roping_id);
    const { data: runRows, error: runError } = await supabase
      .from("public_event_live_results")
      .select("run_id, event_roping_id, first_name, last_name, entry_number, round_number, total_time_seconds, status, handicap_time_credit_seconds")
      .eq("producer_slug", producerSlug)
      .eq("event_slug", liveEvent.slug);
    if (runError) throw new Error(`Unable to load round results: ${runError.message}`);
    roundResults = (runRows ?? []).map((row) => ({
      id: row.run_id, divisionId: row.event_roping_id,
      name: `${row.first_name} ${row.last_name}`.trim(), entryNumber: row.entry_number,
      round: row.round_number, status: row.status,
      totalTime: row.total_time_seconds === null ? null : Number(row.total_time_seconds),
      incentiveAdjustment: Number(row.handicap_time_credit_seconds),
    }));
    const fourDDivisions = (formatRows ?? []).filter(
      (row) => row.competition_format === "four_d",
    );
    const fourDResponses = await Promise.all(
      fourDDivisions.map(async (division) => ({
        division,
        response: await supabase.rpc("calculate_four_d_results", {
          target_roping_division_id: division.event_roping_id,
        }),
      })),
    );
    for (const { division, response } of fourDResponses) {
      if (response.error)
        throw new Error(`Unable to load 4D results: ${response.error.message}`);
      fourDResults.push(
        ...((response.data ?? []) as FourDResultDatabaseRow[]).map((row) => ({
          ...mapFourDResult(row),
          divisionId: division.event_roping_id,
          divisionName: division.event_roping_name,
          resultStatus: liveEvent.result_status,
        })),
      );
    }
    const { data: resultRows, error: resultError } = await supabase
      .from("public_aggregate_results")
      .select(
        "result_id, event_roping_id, event_roping_name, result_status, first_name, last_name, entry_number, aggregate_time_seconds, handicap_time_credit_seconds, status, main_rounds_completed, main_round_count, is_short_round_qualifier, short_round_status",
      )
      .eq("producer_slug", producerSlug)
      .eq("event_slug", liveEvent.slug)
      .order("is_short_round_qualifier", { ascending: false })
      .order("aggregate_time_seconds", { ascending: true, nullsFirst: false });
    if (resultError)
      throw new Error(`Unable to load public results: ${resultError.message}`);
    results = resultRows.map((row) => ({
      resultId: row.result_id,
      divisionId: row.event_roping_id,
      divisionName: row.event_roping_name,
      resultStatus: row.result_status,
      name: `${row.first_name} ${row.last_name}`.trim(),
      entryNumber: row.entry_number,
      totalTime:
        row.aggregate_time_seconds === null
          ? null
          : Number(row.aggregate_time_seconds),
      incentiveAdjustment: Number(row.handicap_time_credit_seconds),
      status: row.status,
      roundsCompleted: row.main_rounds_completed,
      mainRoundCount: row.main_round_count,
      shortRoundQualifier: row.is_short_round_qualifier,
      shortRoundStatus: row.short_round_status,
    }));
  }
  const events: PublicEvent[] = schedule.map((event) => {
    const eventRows = (scheduleRows ?? []).filter(
      (row) => row.event_id === event.id,
    );
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      startsAt: event.starts_at,
      venue: event.venue_name ?? "Location pending",
      address: [
        event.address,
        event.venue_city,
        [event.venue_state, event.venue_postal_code].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", "),
      status: event.status,
      resultStatus: event.result_status,
      entriesOpenAt: event.entries_open_at,
      entriesCloseAt: event.entries_close_at,
      scheduledRopings: eventRows.map((row, index) => ({
        id: row.event_roping_id,
        name: row.event_roping_name,
        scheduledDate: row.scheduled_date,
        startsAt: row.event_roping_starts_at,
        scheduleType: row.schedule_type,
        followsRopingName:
          row.schedule_type === "follows_previous"
            ? (eventRows
                .slice(0, index)
                .findLast(
                  (previous) =>
                    previous.scheduled_date === row.scheduled_date &&
                    previous.arena_name === row.arena_name,
                )?.event_roping_name ?? null)
            : null,
        scheduleNote: row.schedule_note,
        arenaName: row.arena_name,
        eventDayStatus: row.event_day_status,
        estimatedStartsAt: row.estimated_starts_at,
        eventDayNote: row.event_day_note,
      })),
    };
  });
  const logoUrl = producer.logo_path
    ? supabase.storage
        .from("organization-logos")
        .getPublicUrl(producer.logo_path).data.publicUrl
    : null;
  return {
    producer: {
      name: producer.public_name,
      slug: producer.slug,
      logoUrl,
      brandPrimary: producer.brand_primary,
      brandAccent: producer.brand_accent,
    },
    events,
    results,
    fourDResults,
    roundResults,
    shortRoundRopingIds,
    membershipFormPublished: Boolean(membershipForm),
  };
}

export default async function ProducerPublicPage({
  params,
}: PageProps<"/public/[producerSlug]">) {
  const { producerSlug } = await params;
  const data = await getPublicData(producerSlug);
  if (!data) notFound();
  const liveEvent =
    data.events.find((event) => event.status === "in_progress") ??
    data.events.find((event) => event.status === "completed");
  const upcoming = data.events.filter((event) =>
    ["scheduled", "entries_open", "entries_closed"].includes(event.status),
  );
  const groupedResults = Map.groupBy(
    data.results.filter(
      (result) =>
        !data.fourDResults.some(
          (fourDResult) => fourDResult.divisionId === result.divisionId,
        ),
    ),
    (result) => result.divisionId,
  );
  const groupedFourDResults = Map.groupBy(
    data.fourDResults,
    (result) => result.divisionId,
  );
  const displayDate = (value: string) =>
    Number.isNaN(Date.parse(value))
      ? value
      : new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(value),
        );
  const entriesAreOpen = (event: PublicEvent) =>
    !["entries_closed", "in_progress", "completed", "cancelled"].includes(
      event.status,
    ) &&
    (!event.entriesOpenAt || new Date(event.entriesOpenAt) <= new Date()) &&
    (!event.entriesCloseAt || new Date(event.entriesCloseAt) > new Date());

  return (
    <main
      style={getBrandStyle(
        data.producer.brandPrimary,
        data.producer.brandAccent,
      )}
      className="min-h-screen bg-[#f5f6f7]"
    >
      {isSupabaseConfigured() ? <PublicResultsRefresh /> : null}
      <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href={`/public/${producerSlug}`}
            className="flex min-w-0 items-center gap-3"
          >
            {data.producer.logoUrl ? (
              <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1">
                <Image
                  src={data.producer.logoUrl}
                  alt={`${data.producer.name} logo`}
                  width={48}
                  height={36}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </span>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md brand-accent-fill text-sm font-black">
                {data.producer.name
                  .split(" ")
                  .slice(0, 2)
                  .map((word: string) => word[0])
                  .join("")}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {data.producer.name}
              </span>
              <span className="hidden text-xs brand-muted sm:block">
                Official event information
              </span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-3 text-xs font-semibold brand-muted sm:gap-5 sm:text-sm">
            <a href="#schedule" className="brand-hover">
              Schedule
            </a>
            <a href="#results" className="brand-hover">
              Results
            </a>
            {data.membershipFormPublished ? (
              <Link
                href={`/public/${producerSlug}/membership`}
                className="brand-hover"
              >
                Membership
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
        {liveEvent ? (
          <section className="border-b border-[#d7ddda] pb-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
                  <Radio size={14} />{" "}
                  {liveEvent.status === "in_progress"
                    ? "Live event"
                    : "Latest results"}
                </p>
                <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
                  {liveEvent.title}
                </h1>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]">
                  <span className="flex items-center gap-2">
                    <CalendarDays size={16} /> {displayDate(liveEvent.startsAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin size={16} />{" "}
                    {[liveEvent.venue, liveEvent.address]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              </div>
              <div
                className={`w-fit rounded-md border px-4 py-3 ${liveEvent.resultStatus === "official" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
              >
                <p
                  className={`text-xs font-bold uppercase ${liveEvent.resultStatus === "official" ? "text-emerald-700" : "text-amber-700"}`}
                >
                  Results status
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold">
                  <Clock3 size={15} />{" "}
                  {liveEvent.resultStatus === "official"
                    ? "Official results"
                    : "Unofficial · updating live"}
                </p>
              </div>
            </div>
            {liveEvent.scheduledRopings.length ? (
              <PublicClassSchedule events={liveEvent.scheduledRopings} live />
            ) : null}
          </section>
        ) : (
          <section>
            <h1 className="text-3xl font-bold">{data.producer.name}</h1>
            <p className="mt-3 text-sm text-[#66716b]">
              Schedule and published results
            </p>
          </section>
        )}
        <section id="results">
          <div>
            <h2 className="text-xl font-bold">Results</h2>
            <p className="mt-1 text-sm text-[#66716b]">
              {data.results.length
                ? `${data.results.length} entries in the live aggregate`
                : "No aggregate results yet"}
            </p>
          </div>
          <div className="mt-4 space-y-5">
            {Array.from(groupedFourDResults.values()).map((results) => (
              <FourDStandings
                key={results[0].divisionId}
                rows={results}
                resultStatus={results[0].resultStatus}
                title={results[0].divisionName}
              />
            ))}
            {Array.from(groupedResults.values()).map((results) => (
              <PublicRopingResults
                key={results[0].divisionId}
                results={results}
                runs={data.roundResults.filter((run) => run.divisionId === results[0].divisionId)}
                shortRoundEnabled={data.shortRoundRopingIds.includes(results[0].divisionId)}
              />
            ))}
          </div>
        </section>
        <section id="schedule" className="border-t border-[#d7ddda] pt-8">
          <h2 className="text-xl font-bold">Upcoming events</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {upcoming.map((event) => {
              const open = entriesAreOpen(event);
              return (
                <article
                  key={event.id}
                  className="rounded-md border border-[#dfe4e1] bg-white p-5"
                >
                  <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
                    {displayDate(event.startsAt)}
                  </p>
                  <h3 className="mt-2 font-bold">{event.title}</h3>
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#66716b]">
                    <MapPin size={15} />{" "}
                    {[event.venue, event.address].filter(Boolean).join(", ")}
                  </p>
                  {event.scheduledRopings.length ? (
                    <PublicClassSchedule events={event.scheduledRopings} />
                  ) : null}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p
                      className={`flex items-center gap-2 text-xs font-semibold ${open ? "text-emerald-700" : "text-[#66716b]"}`}
                    >
                      {open ? <CheckCircle2 size={14} /> : null}
                      {open
                        ? "Entries open"
                        : event.status === "entries_closed"
                          ? "Entries closed"
                          : "Scheduled"}
                    </p>
                    {open && isSupabaseConfigured() ? (
                      <Link
                        href={`/public/${producerSlug}/${event.slug}/enter`}
                        className="flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-xs font-bold text-white"
                      >
                        Enter online <ArrowRight size={14} />
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!upcoming.length ? (
              <p className="text-sm text-[#758078]">
                No upcoming events are published.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function PublicClassSchedule({
  events,
  live = false,
}: {
  events: PublicEvent["scheduledRopings"];
  live?: boolean;
}) {
  const statusLabels: Record<string, string> = {
    scheduled: "Scheduled",
    delayed: "Delayed",
    holding: "Holding",
    in_progress: "In progress",
    completed: "Completed",
  };

  return (
    <ol
      className={`${live ? "mt-6" : "mt-4"} divide-y divide-[#e7ebe8] border-y border-[#e7ebe8]`}
    >
      {events.map((roping) => {
        const displayStart = roping.estimatedStartsAt ?? roping.startsAt;
        return (
          <li
            key={roping.id}
            className="flex items-start justify-between gap-3 py-3 text-xs"
          >
            <span className="min-w-0 font-semibold">
              <span className="block truncate">{roping.name}</span>
              {roping.arenaName ? (
                <span className="mt-1 block text-[10px] font-medium text-[#66716b]">
                  {roping.arenaName}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-right text-[#66716b]">
              <span className="block">
                {displayStart
                  ? `${roping.estimatedStartsAt ? "Updated " : ""}${new Intl.DateTimeFormat(
                      "en-US",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    ).format(new Date(displayStart))}`
                  : `Follows ${roping.followsRopingName ?? "previous roping"}`}
                {!roping.estimatedStartsAt &&
                roping.scheduleType === "tentative"
                  ? " tentative"
                  : ""}
              </span>
              {roping.eventDayStatus !== "scheduled" ? (
                <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                  {statusLabels[roping.eventDayStatus] ?? roping.eventDayStatus}
                </span>
              ) : null}
              {(roping.eventDayNote ?? roping.scheduleNote) ? (
                <span className="mt-1 block max-w-64 text-[10px]">
                  {roping.eventDayNote ?? roping.scheduleNote}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
