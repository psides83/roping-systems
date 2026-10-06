import "server-only";
import { ropingDisplayName } from "./roping-display-name";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { events as demoRopings } from "@/data/demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { mapFourDResult, type FourDResultDatabaseRow, type FourDResultRow } from "@/components/events/four-d-standings";
import type { PublicResult, PublicRoundResult } from "@/lib/events/public-standings";
import { selectPublicEvent } from "@/lib/events/public-event-navigation";
import type { PublicMoneyResult } from "@/lib/events/public-money-results";
import type { ProducerSeason } from "@/lib/seasons";

export interface PublicEvent {
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
    competitionFormat?: string;
  }>;
}


export interface PublicFourDResult extends FourDResultRow {
  divisionId: string;
  divisionName: string;
  resultStatus: string;
}


export async function getPublicData(producerSlug: string, requestedEventSlug?: string) {
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
    const demoEvent = selectPublicEvent(events, requestedEventSlug);
    return {
      producer: {
        name: "Red River Calf Ropers",
        slug: producerSlug,
        logoUrl: null as string | null,
        brandPrimary: "#17251F",
        brandAccent: "#BB3E24",
        timezone: "America/Chicago",
        entryLabelStyle: "number" as const,
      },
      events,
      seasons: [{ id: "preview-season", name: "2026", startsOn: "2026-01-01", endsOn: "2026-12-31" }] as ProducerSeason[],
      results: [
        {
          resultId: "1",
          divisionId: demoEvent?.scheduledRopings[0].id ?? "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: demoEvent?.resultStatus ?? "unofficial",
          name: "Jace Holloway",
          entryNumber: 1,
          totalTime: 19.42,
          incentiveAdjustment: 0,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
        {
          resultId: "2",
          divisionId: demoEvent?.scheduledRopings[0].id ?? "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: demoEvent?.resultStatus ?? "unofficial",
          name: "Wyatt James",
          entryNumber: 1,
          totalTime: 19.71,
          incentiveAdjustment: 1.5,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
        {
          resultId: "3",
          divisionId: demoEvent?.scheduledRopings[0].id ?? "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: demoEvent?.resultStatus ?? "unofficial",
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
          divisionId: demoEvent?.scheduledRopings[0].id ?? "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: demoEvent?.resultStatus ?? "unofficial",
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
      moneyResults: [] as PublicMoneyResult[],
      shortRoundRopingIds: [] as string[],
      membershipFormPublished: false,
    };
  }

  const supabase = await createClient();
  const { data: producer } = await supabase
    .from("public_producer_pages")
    .select("id, public_name, slug, logo_path, brand_primary, brand_accent, timezone, entry_label_style")
    .eq("slug", producerSlug)
    .single();
  if (!producer) return null;
  const { data: seasonRows, error: seasonError } = await supabase.from("public_producer_seasons")
    .select("id, name, starts_on, ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  if (seasonError) throw new Error(`Unable to load seasons: ${seasonError.message}`);
  const seasons: ProducerSeason[] = (seasonRows ?? []).map((row) => ({ id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on }));
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
      "event_id, event_roping_id, event_roping_name, division_name, event_roping_starts_at, scheduled_date, schedule_type, schedule_note, arena_name, event_day_status, estimated_starts_at, event_day_note, sort_order",
    )
    .eq("producer_slug", producerSlug)
    .order("scheduled_date")
    .order("sort_order");
  if (classScheduleError)
    throw new Error(
      `Unable to load the class schedule: ${classScheduleError.message}`,
    );
  const selectedEvent =
    selectPublicEvent(schedule, requestedEventSlug);
  let results: PublicResult[] = [];
  const fourDResults: PublicFourDResult[] = [];
  let roundResults: PublicRoundResult[] = [];
  let moneyResults: PublicMoneyResult[] = [];
  let shortRoundRopingIds: string[] = [];
  const formats = new Map<string, string>();
  if (selectedEvent) {
    const moneyRows = await readAllRows<{
      event_roping_id: string; plan_id: string; pool_name: string; pool_type: string;
      section_type: string; round_number: number | null; d_number: number | null;
      place_number: number; entry_id: string; roper_id: string; contestant_name: string;
      performance_seconds: number | string; payout_cents: number | string;
    }>((first, last) => supabase.rpc("public_event_money_results", { target_event_id: selectedEvent.id })
      .order("plan_id").order("section_type").order("round_number", { nullsFirst: true }).order("d_number", { nullsFirst: true }).order("entry_id").range(first,last), "Unable to load money winners");
    moneyResults = (moneyRows ?? []).map((row: {
      event_roping_id: string; plan_id: string; pool_name: string; pool_type: string;
      section_type: string; round_number: number | null; d_number: number | null;
      place_number: number; entry_id: string; roper_id: string; contestant_name: string;
      performance_seconds: number | string; payout_cents: number | string;
    }) => ({
      ropingId: row.event_roping_id, planId: row.plan_id, poolName: row.pool_name, poolType: row.pool_type,
      sectionType: row.section_type, roundNumber: row.round_number, dNumber: row.d_number,
      place: row.place_number, entryId: row.entry_id, roperId: row.roper_id, name: row.contestant_name,
      time: Number(row.performance_seconds), payoutCents: Number(row.payout_cents),
    }));
    const { data: formatRows, error: formatError } = await supabase
      .from("public_competition_formats")
      .select("event_roping_id, event_roping_name, competition_format, short_round_enabled")
      .eq("producer_slug", producerSlug)
      .eq("event_id", selectedEvent.id);
    if (formatError)
      throw new Error(
        `Unable to load competition formats: ${formatError.message}`,
      );
    for (const row of formatRows ?? []) formats.set(row.event_roping_id, row.competition_format);
    shortRoundRopingIds = (formatRows ?? []).filter((row) => row.short_round_enabled).map((row) => row.event_roping_id);
    const runRows = await readAllRows((first,last) => supabase
      .from("public_event_live_results")
      .select("run_id, entry_id, event_roping_id, first_name, last_name, entry_number, round_number, total_time_seconds, status, handicap_time_credit_seconds")
      .eq("producer_slug", producerSlug)
      .eq("event_slug", selectedEvent.slug).order("run_id").range(first,last), "Unable to load round results");
    roundResults = (runRows ?? []).map((row) => ({
      id: row.run_id, entryId: row.entry_id, divisionId: row.event_roping_id,
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
          resultStatus: selectedEvent.result_status,
        })),
      );
    }
    const resultRows = await readAllRows((first,last) => supabase
      .from("public_aggregate_results")
      .select(
        "result_id, event_roping_id, event_roping_name, result_status, first_name, last_name, entry_number, aggregate_time_seconds, handicap_time_credit_seconds, status, main_rounds_completed, main_round_count, is_short_round_qualifier, short_round_status",
      )
      .eq("producer_slug", producerSlug)
      .eq("event_slug", selectedEvent.slug)
      .order("is_short_round_qualifier", { ascending: false })
      .order("aggregate_time_seconds", { ascending: true, nullsFirst: false }).order("result_id").range(first,last), "Unable to load public results");
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
    for (const row of fourDResults) {
      row.resultStatus = results.find((result) => result.divisionId === row.divisionId)?.resultStatus ?? row.resultStatus;
    }
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
      scheduledRopings: eventRows.map((row, index) => {
        const previousRoping = row.schedule_type === "follows_previous"
          ? eventRows.slice(0, index).findLast((previous) => previous.scheduled_date === row.scheduled_date && previous.arena_name === row.arena_name)
          : undefined;
        return {
        id: row.event_roping_id,
        name: ropingDisplayName(row.event_roping_name, row.division_name),
        scheduledDate: row.scheduled_date,
        startsAt: row.event_roping_starts_at,
        scheduleType: row.schedule_type,
        followsRopingName: previousRoping ? ropingDisplayName(previousRoping.event_roping_name, previousRoping.division_name) : null,
        scheduleNote: row.schedule_note,
        arenaName: row.arena_name,
        eventDayStatus: row.event_day_status,
        estimatedStartsAt: row.estimated_starts_at,
        eventDayNote: row.event_day_note,
        competitionFormat: formats.get(row.event_roping_id),
        };
      }),
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
      timezone: producer.timezone,
      entryLabelStyle: producer.entry_label_style as "number" | "letter",
    },
    events,
    seasons,
    results,
    fourDResults,
    roundResults,
    moneyResults,
    shortRoundRopingIds,
    membershipFormPublished: Boolean(membershipForm),
  };
}
