import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";
import {
  DatabaseLiveDesk,
  type LiveRunRow,
} from "@/components/events/database-live-desk";
import {
  FourDStandings,
  mapFourDResult,
  type FourDResultDatabaseRow,
  type FourDResultRow,
} from "@/components/events/four-d-standings";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { RunStatus } from "@/lib/run-status";
import type { RoundOrderMethod } from "@/types/domain";
import type { ClassEventDayStatus } from "@/components/events/class-operations-dialog";
import type { ShortRoundCandidate } from "@/components/events/short-round-field-dialog";
import {
  finalizeRoping,
  startRoping,
} from "@/app/(app)/events/[eventId]/actions";

type TimerResolution = "average" | "best" | "longest";
type CompetitionFormat = "standard" | "handicap" | "four_d";

interface LiveDivision {
  id: string;
  name: string;
  numberOfRuns: number;
  shortRoundEnabled: boolean;
  shortRoundSeeded: boolean;
  shortRoundLocked: boolean;
  timerCount: number;
  timerResolution: TimerResolution;
  competitionFormat: CompetitionFormat;
  secondRoundOrdering: RoundOrderMethod;
  laterRoundOrdering: RoundOrderMethod;
  cattleDrawEnabled: boolean;
  arenaName: string | null;
  eventDayStatus: ClassEventDayStatus;
  estimatedStart: string;
  eventDayNote: string | null;
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

export default async function LiveRopingPage({
  params,
  searchParams,
}: PageProps<"/events/[eventId]/live">) {
  const { eventId } = await params;
  const query = await searchParams;

  if (!isSupabaseConfigured()) {
    const selectedDivisionId = getSelectedDivisionId(
      previewDivisions,
      query.division,
    );
    const selectedDivision = previewDivisions.find(
      (division) => division.id === selectedDivisionId,
    );
    return (
      <LiveWorkspace
        eventId={eventId}
        arenaCount={2}
        title="Fall Classic"
        status="in_progress"
        resultStatus="unofficial"
        divisions={previewDivisions}
        selectedDivisionId={selectedDivisionId}
        selectedRound={getSelectedRound(
          query.round,
          getTotalRounds(selectedDivision),
        )}
        runs={previewRuns}
        cattleTags={[]}
        shortRoundCandidates={[]}
        fourDResults={[]}
        roundLocked={false}
        mainRoundsComplete
        canEdit={false}
      />
    );
  }

  const producer = await getActiveProducer();
  if (!producer) notFound();
  const supabase = await createClient();
  const { data: roping } = await supabase
    .from("events")
    .select(
      "id, title, status, result_status, arena_count, event_ropings(id, name, scheduled_date, sort_order, main_round_count, short_round_enabled, short_round_seeded_at, short_round_locked_at, timer_count, timer_resolution, competition_format, second_round_ordering, later_round_ordering, cattle_draw_enabled, arena_name, event_day_status, estimated_starts_at, event_day_note)",
    )
    .eq("id", eventId)
    .eq("producer_id", producer.id)
    .single();
  if (!roping) notFound();

  const divisions = (
    roping.event_ropings as unknown as Array<{
      id: string;
      name: string;
      scheduled_date: string;
      sort_order: number;
      main_round_count: number;
      short_round_enabled: boolean;
      short_round_seeded_at: string | null;
      short_round_locked_at: string | null;
      timer_count: number;
      timer_resolution: TimerResolution;
      competition_format: CompetitionFormat;
      second_round_ordering: RoundOrderMethod;
      later_round_ordering: RoundOrderMethod;
      cattle_draw_enabled: boolean;
      arena_name: string | null;
      event_day_status: ClassEventDayStatus;
      estimated_starts_at: string | null;
      event_day_note: string | null;
    }>
  )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((division) => ({
      id: division.id,
      name: `${division.name} · ${new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`,
      numberOfRuns: division.main_round_count,
      shortRoundEnabled: division.short_round_enabled,
      shortRoundSeeded: Boolean(division.short_round_seeded_at),
      shortRoundLocked: Boolean(division.short_round_locked_at),
      timerCount: division.timer_count,
      timerResolution: division.timer_resolution,
      competitionFormat: division.competition_format,
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
    }));
  const selectedDivisionId = getSelectedDivisionId(divisions, query.division);
  const selectedDivision = divisions.find(
    (division) => division.id === selectedDivisionId,
  );
  const selectedRound = getSelectedRound(
    query.round,
    getTotalRounds(selectedDivision),
  );
  let runs: LiveRunRow[] = [];
  let mainRoundsComplete = false;
  let fourDResults: FourDResultRow[] = [];
  let roundLocked = false;
  let cattleTags: string[] = [];
  let shortRoundCandidates: ShortRoundCandidate[] = [];

  if (selectedDivisionId) {
    const { data: runData, error } = await supabase
      .from("competition_runs")
      .select(
        "id, entry_id, draw_position, raw_time_seconds, penalty_seconds, status, rerun_count, event_cattle(tag_number), run_timer_readings(timer_number, time_seconds), entries:roping_entries!inner(entry_number, handicap_time_credit_seconds, ropers!inner(first_name, last_name))",
      )
      .eq("event_roping_id", selectedDivisionId)
      .eq("round_number", selectedRound)
      .order("draw_position", { ascending: true, nullsFirst: false });
    if (error)
      throw new Error(`Unable to load the event desk: ${error.message}`);
    runs = runData.map((run) => {
      const entry = run.entries as unknown as {
        entry_number: number;
        handicap_time_credit_seconds: number;
        ropers: { first_name: string; last_name: string };
      };
      return {
        id: run.id,
        entryId: run.entry_id,
        drawPosition: run.draw_position,
        name: `${entry.ropers.first_name} ${entry.ropers.last_name}`,
        entryNumber: entry.entry_number,
        rawTime:
          run.raw_time_seconds === null ? null : Number(run.raw_time_seconds),
        penalty: Number(run.penalty_seconds),
        incentiveAdjustment: Number(entry.handicap_time_credit_seconds),
        timerReadings: (
          run.run_timer_readings as unknown as Array<{
            timer_number: number;
            time_seconds: number;
          }>
        )
          .sort((a, b) => a.timer_number - b.timer_number)
          .map((reading) => Number(reading.time_seconds)),
        carryTime: null,
        status: run.status as RunStatus,
        rerunCount: run.rerun_count,
        cattleTag:
          (run.event_cattle as unknown as { tag_number: string } | null)
            ?.tag_number ?? null,
      };
    });
    if (selectedDivision?.cattleDrawEnabled) {
      const { data: cattleData, error: cattleError } = await supabase
        .from("event_cattle")
        .select("tag_number")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("tag_number");
      if (cattleError)
        throw new Error(`Unable to load event cattle: ${cattleError.message}`);
      cattleTags = cattleData.map((animal) => animal.tag_number);
    }
    if (selectedDivision?.shortRoundSeeded) {
      const { data: candidateData, error: candidateError } = await supabase.rpc(
        "get_short_round_candidates",
        { target_roping_division_id: selectedDivisionId },
      );
      if (candidateError)
        throw new Error(
          `Unable to load short round finalists: ${candidateError.message}`,
        );
      shortRoundCandidates = (
        (candidateData ?? []) as Array<{
          entry_id: string;
          contestant_name: string;
          aggregate_time: number;
          last_round_time: number;
          is_qualifier: boolean;
        }>
      ).map((candidate) => ({
        entryId: candidate.entry_id,
        name: candidate.contestant_name,
        aggregateTime: Number(candidate.aggregate_time),
        lastRoundTime: Number(candidate.last_round_time),
        isQualifier: candidate.is_qualifier,
      }));
    }
    if (
      selectedDivision &&
      selectedRound > selectedDivision.numberOfRuns &&
      runs.length
    ) {
      const { data: mainRunData, error: aggregateError } = await supabase
        .from("competition_runs")
        .select(
          "entry_id, raw_time_seconds, penalty_seconds, status, entries:roping_entries!inner(handicap_time_credit_seconds)",
        )
        .eq("event_roping_id", selectedDivisionId)
        .lte("round_number", selectedDivision.numberOfRuns)
        .in(
          "entry_id",
          runs.map((run) => run.entryId),
        );
      if (aggregateError)
        throw new Error(
          `Unable to load carried aggregates: ${aggregateError.message}`,
        );
      const aggregates = new Map<string, number>();
      for (const mainRun of mainRunData) {
        if (mainRun.status !== "complete" || mainRun.raw_time_seconds === null)
          continue;
        const entry = mainRun.entries as unknown as {
          handicap_time_credit_seconds: number;
        };
        const adjustedTime = Math.max(
          Number(mainRun.raw_time_seconds) +
            Number(mainRun.penalty_seconds) -
            Number(entry.handicap_time_credit_seconds),
          0,
        );
        aggregates.set(
          mainRun.entry_id,
          (aggregates.get(mainRun.entry_id) ?? 0) + adjustedTime,
        );
      }
      runs = runs.map((run) => ({
        ...run,
        carryTime: aggregates.get(run.entryId) ?? null,
      }));
    }
    const { count: pendingMainCount, error: pendingError } = await supabase
      .from("competition_runs")
      .select("id", { count: "exact", head: true })
      .eq("event_roping_id", selectedDivisionId)
      .lte("round_number", selectedDivision?.numberOfRuns ?? 1)
      .in("status", ["pending", "rerun"]);
    if (pendingError)
      throw new Error(`Unable to check main rounds: ${pendingError.message}`);
    mainRoundsComplete = pendingMainCount === 0;
    const { data: roundControl, error: roundError } = await supabase
      .from("event_roping_rounds")
      .select("status")
      .eq("event_roping_id", selectedDivisionId)
      .eq("round_number", selectedRound)
      .maybeSingle();
    if (roundError)
      throw new Error(`Unable to load the round status: ${roundError.message}`);
    roundLocked = roundControl?.status === "locked";
    if (selectedDivision?.competitionFormat === "four_d") {
      const { data: resultData, error: resultError } = await supabase.rpc(
        "calculate_four_d_results",
        { target_roping_division_id: selectedDivisionId },
      );
      if (resultError)
        throw new Error(
          `Unable to calculate 4D standings: ${resultError.message}`,
        );
      fourDResults = ((resultData ?? []) as FourDResultDatabaseRow[]).map(
        mapFourDResult,
      );
    }
  }

  return (
    <LiveWorkspace
      eventId={eventId}
      arenaCount={roping.arena_count}
      title={roping.title}
      status={roping.status}
      resultStatus={roping.result_status}
      divisions={divisions}
      selectedDivisionId={selectedDivisionId}
      selectedRound={selectedRound}
      runs={runs}
      cattleTags={cattleTags}
      shortRoundCandidates={shortRoundCandidates}
      fourDResults={fourDResults}
      roundLocked={roundLocked}
      mainRoundsComplete={mainRoundsComplete}
      canEdit={producer.role !== "viewer"}
    />
  );
}

function LiveWorkspace({
  eventId,
  arenaCount,
  title,
  status,
  resultStatus,
  divisions,
  selectedDivisionId,
  selectedRound,
  runs,
  cattleTags,
  shortRoundCandidates,
  fourDResults,
  roundLocked,
  mainRoundsComplete,
  canEdit,
}: {
  eventId: string;
  arenaCount: number;
  title: string;
  status: string;
  resultStatus: string;
  divisions: LiveDivision[];
  selectedDivisionId?: string;
  selectedRound: number;
  runs: LiveRunRow[];
  cattleTags: string[];
  shortRoundCandidates: ShortRoundCandidate[];
  fourDResults: FourDResultRow[];
  roundLocked: boolean;
  mainRoundsComplete: boolean;
  canEdit: boolean;
}) {
  const selectedDivision = divisions.find(
    (division) => division.id === selectedDivisionId,
  );
  const startAction = startRoping.bind(null, eventId);
  const finalizeAction = finalizeRoping.bind(null, eventId);

  return (
    <div className="space-y-6">
      <nav aria-label="Event navigation" className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href="/events/current" className="flex items-center gap-2"><ArrowLeft size={16} /> Event desks</Link>
        <Link href={`/events/${eventId}`}>Manage event</Link>
        <Link href={`/events/${eventId}/entries`}>Entries</Link>
        <Link href={`/events/${eventId}/payouts`}>Payouts</Link>
      </nav>
      <PageHeader
        eyebrow={`Event desk · ${status.replaceAll("_", " ")} · ${resultStatus}`}
        title={title}
        description="Set each round's draw and record times. Saved runs publish to the live results page while results remain unofficial."
        actions={
          canEdit ? (
            <div className="flex gap-2">
              {status !== "in_progress" &&
              status !== "completed" &&
              status !== "cancelled" ? (
                <form action={startAction}>
                  <button className="h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">
                    Start event
                  </button>
                </form>
              ) : null}
              {status === "in_progress" ? (
                <form action={finalizeAction}>
                  <button className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">
                    <LockKeyhole size={16} /> Finalize
                  </button>
                </form>
              ) : null}
            </div>
          ) : null
        }
      />
      {selectedDivisionId && selectedDivision ? (
        <>
          {selectedDivision.competitionFormat === "four_d" ? (
            <FourDStandings rows={fourDResults} resultStatus={resultStatus} />
          ) : null}
          <DatabaseLiveDesk
            key={JSON.stringify([selectedDivisionId, selectedRound, selectedDivision, roundLocked, status, runs])}
            eventId={eventId}
            arenaCount={arenaCount}
            divisions={divisions}
            selectedDivisionId={selectedDivisionId}
            selectedRound={selectedRound}
            runs={runs}
            cattleTags={cattleTags}
            shortRoundCandidates={shortRoundCandidates}
            roundLocked={roundLocked}
            timerCount={selectedDivision.timerCount}
            timerResolution={selectedDivision.timerResolution}
            eventStatus={status}
            isShortRound={selectedRound > selectedDivision.numberOfRuns}
            shortRoundSeeded={selectedDivision.shortRoundSeeded}
            mainRoundsComplete={mainRoundsComplete}
            canEdit={canEdit}
          />
        </>
      ) : (
        <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-12 text-center">
          <p className="font-semibold">This event has no classes.</p>
        </div>
      )}
    </div>
  );
}

function getSelectedDivisionId(
  divisions: LiveDivision[],
  requested: string | string[] | undefined,
) {
  const requestedId = typeof requested === "string" ? requested : undefined;
  return divisions.some((division) => division.id === requestedId)
    ? requestedId
    : divisions[0]?.id;
}

function getSelectedRound(
  requested: string | string[] | undefined,
  numberOfRuns: number,
) {
  const parsed = typeof requested === "string" ? Number(requested) : 1;
  if (!Number.isInteger(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), Math.max(numberOfRuns, 1));
}

function getTotalRounds(division: LiveDivision | undefined) {
  if (!division) return 1;
  return division.numberOfRuns + (division.shortRoundEnabled ? 1 : 0);
}

const previewDivisions: LiveDivision[] = [
  {
    id: "calf-open",
    name: "Calf roping · Open",
    numberOfRuns: 2,
    shortRoundEnabled: true,
    shortRoundSeeded: true,
    shortRoundLocked: false,
    timerCount: 2,
    timerResolution: "average",
    competitionFormat: "standard",
    secondRoundOrdering: "reverse_first",
    laterRoundOrdering: "aggregate_slowest_to_fastest",
    cattleDrawEnabled: true,
    arenaName: "Arena 1",
    eventDayStatus: "in_progress",
    estimatedStart: "",
    eventDayNote: null,
  },
  {
    id: "breakaway-115",
    name: "Breakaway · 11.5",
    numberOfRuns: 1,
    shortRoundEnabled: false,
    shortRoundSeeded: false,
    shortRoundLocked: false,
    timerCount: 2,
    timerResolution: "longest",
    competitionFormat: "handicap",
    secondRoundOrdering: "reverse_first",
    laterRoundOrdering: "aggregate_slowest_to_fastest",
    cattleDrawEnabled: false,
    arenaName: "Arena 2",
    eventDayStatus: "delayed",
    estimatedStart: "2026-09-27T10:30",
    eventDayNote: "Holding for arena preparation",
  },
];

const previewRuns: LiveRunRow[] = [
  {
    id: "5b3d53b5-4d0a-47e8-9191-2aa2ec193d85",
    entryId: "031ba013-9455-49ad-b151-f9eae91a4b9a",
    drawPosition: 1,
    name: "Jace Holloway",
    entryNumber: 12,
    rawTime: null,
    penalty: 0,
    incentiveAdjustment: 0,
    timerReadings: [],
    carryTime: 22.64,
    status: "pending",
    rerunCount: 0,
    cattleTag: "104",
  },
  {
    id: "c79af70b-496b-4331-9cdf-9102e0284aa4",
    entryId: "1a04a55b-2d8c-469a-a814-b11df7ee35c8",
    drawPosition: 2,
    name: "Mara Bennett",
    entryNumber: 8,
    rawTime: null,
    penalty: 0,
    incentiveAdjustment: 1.5,
    timerReadings: [],
    carryTime: 22.08,
    status: "pending",
    rerunCount: 0,
    cattleTag: "112",
  },
  {
    id: "68067ab7-d80f-4885-bca0-8721c50c6a12",
    entryId: "3f499d8b-401d-4e30-ac4b-30637017fc86",
    drawPosition: 3,
    name: "Cole Rawlins",
    entryNumber: 21,
    rawTime: null,
    penalty: 0,
    incentiveAdjustment: 0,
    timerReadings: [],
    carryTime: 21.15,
    status: "pending",
    rerunCount: 0,
    cattleTag: "107",
  },
  {
    id: "17bc849a-ff32-4c87-b42a-37fd7868a4f1",
    entryId: "f058f435-844d-4b58-b571-dd11f8bb30e8",
    drawPosition: 4,
    name: "Lena Hart",
    entryNumber: 5,
    rawTime: null,
    penalty: 0,
    incentiveAdjustment: 0,
    timerReadings: [],
    carryTime: 20.42,
    status: "pending",
    rerunCount: 0,
    cattleTag: "101",
  },
];
