import type { ReactNode } from "react";
import { ClassificationWatchEvidence } from "@/components/members/classification-watch-evidence";
import { EventWorkflowNav } from "@/components/events/event-workflow-nav";
import { EventLifecycleControl } from "@/components/events/event-lifecycle-control";
import { TimingControl } from "@/components/events/timing-control";
import { TimerSaveRecovery } from "@/components/events/timer-save-recovery";
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
import type { PenaltyOption } from "@/lib/penalties";

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
  const timingPermission = await supabase.rpc("can_time_event", { target_event: eventId });
  if (timingPermission.error) throw new Error("Unable to check timing access.");
  let canTime = Boolean(timingPermission.data);
  const managePermission = await supabase.rpc("can_manage_event", { target_event: eventId });
  if (managePermission.error) throw new Error("Unable to check event management access.");

  const { data: auth } = await supabase.auth.getUser();
  const assignment = await supabase.from("staff_event_assignments").select("arena_number")
    .eq("event_id", eventId).eq("user_id", auth.user?.id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (assignment.error) throw new Error("Unable to load your arena assignment.");
  const assignedArena = !managePermission.data && assignment.data?.arena_number
    ? `Arena ${assignment.data.arena_number}` : null;

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
    .filter((division) => !assignedArena || division.arena_name === assignedArena || !division.arena_name || division.arena_name === "First Available")
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
  if (selectedDivisionId) {
    const permission = await supabase.rpc("can_time_roping", { target_roping: selectedDivisionId });
    if (permission.error) throw new Error("Unable to check this roping's timing access.");
    canTime = Boolean(permission.data);
  }
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
        "id, recorded_at, entry_id, draw_position, raw_time_seconds, penalty_seconds, applied_penalties, status, rerun_count, event_cattle(tag_number), run_timer_readings(timer_number, time_seconds), entries:roping_entries!inner(entry_number, handicap_time_credit_seconds, ropers!inner(first_name, last_name))",
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
        recordedAt: run.recorded_at,
        entryId: run.entry_id,
        drawPosition: run.draw_position,
        name: `${entry.ropers.first_name} ${entry.ropers.last_name}`,
        entryNumber: entry.entry_number,
        rawTime:
          run.raw_time_seconds === null ? null : Number(run.raw_time_seconds),
        penalty: Number(run.penalty_seconds),
        selectedPenaltyIds: (run.applied_penalties as unknown as PenaltyOption[]).map((p) => p.id).concat(
          Number(run.penalty_seconds) > 0 && !(run.applied_penalties as unknown as PenaltyOption[]).length ? ["recorded"] : []),
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
    const { data: fineRestrictions, error: fineError } = await supabase.rpc("event_member_fine_restrictions", { target_roping_id: selectedDivisionId });
    if (fineError) throw new Error(`Unable to load fine restrictions: ${fineError.message}`);
    const fineBlockedEntries = new Set((fineRestrictions ?? []).filter((restriction: { blocked: boolean }) => restriction.blocked).map((restriction: { entry_id: string }) => restriction.entry_id));
    runs = runs.map((run) => ({ ...run, fineBlocked: fineBlockedEntries.has(run.entryId) }));
    if (canTime) {
      const { data: options, error: penaltyError } = await supabase.rpc("event_run_penalty_options", { target_event_roping_id: selectedDivisionId });
      if (penaltyError) throw new Error(`Unable to load applicable penalties: ${penaltyError.message}`);
      const byRun = new Map((options as Array<{ run_id: string; options: PenaltyOption[] }>).map((row) => [row.run_id, row.options]));
      runs = runs.map((run) => ({ ...run, penaltyOptions: byRun.get(run.id) ?? [] }));
    }
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
      canEdit={Boolean(managePermission.data)}
      canTime={canTime}
      staffUserId={auth.user?.id}
      watchEvidence={<ClassificationWatchEvidence eventId={eventId} compact />}
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
  canTime = canEdit,
  watchEvidence,
  staffUserId,
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
  canTime?: boolean;
  watchEvidence?: ReactNode;
  staffUserId?: string;
}) {
  const selectedDivision = divisions.find(
    (division) => division.id === selectedDivisionId,
  );

  return (
    <div className="space-y-6">
      <EventWorkflowNav eventId={eventId} active="live" />
      <PageHeader
        eyebrow={`Event desk · ${status.replaceAll("_", " ")} · ${resultStatus}`}
        title={title}
        description=""
        actions={
          <EventLifecycleControl eventId={eventId} status={status} resultStatus={resultStatus} enabled={canEdit} />
        }
      />
      {watchEvidence}
      {staffUserId ? <TimerSaveRecovery eventId={eventId} userId={staffUserId} activeRunId={runs.find((run) => run.status === "pending")?.id} activeAttempt={runs.find((run) => run.status === "pending")?.rerunCount} /> : null}
      {selectedDivisionId && selectedDivision ? (
        <>
          {selectedDivision.competitionFormat === "four_d" ? (
            <FourDStandings rows={fourDResults} resultStatus={resultStatus} />
          ) : null}
          <TimingControl key={selectedDivisionId} ropingId={selectedDivisionId} staffUserId={staffUserId} enabled={canTime && status === "in_progress" && selectedDivision.eventDayStatus !== "completed"} canTakeover={canEdit}>
          {!/^Arena [1-9][0-9]*$/.test(selectedDivision.arenaName ?? "") ? <p role="status" className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm font-semibold">First Available · An event manager must assign an arena before timing can begin.</p> : null}
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
            canTime={canTime}
          />
          </TimingControl>
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
    : (divisions.find((division) => division.eventDayStatus === "in_progress" && /^Arena [1-9][0-9]*$/.test(division.arenaName ?? ""))
      ?? divisions.find((division) => /^Arena [1-9][0-9]*$/.test(division.arenaName ?? "")) ?? divisions[0])?.id;
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
