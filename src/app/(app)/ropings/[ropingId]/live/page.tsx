import { LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";
import {
  DatabaseLiveDesk,
  type LiveRunRow,
} from "@/components/ropings/database-live-desk";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  finalizeRoping,
  startRoping,
} from "@/app/(app)/ropings/[ropingId]/actions";

type TimerResolution = "average" | "best" | "longest";

interface LiveDivision {
  id: string;
  name: string;
  numberOfRuns: number;
  shortRoundEnabled: boolean;
  shortRoundSeeded: boolean;
  timerCount: number;
  timerResolution: TimerResolution;
}

export default async function LiveRopingPage({
  params,
  searchParams,
}: PageProps<"/ropings/[ropingId]/live">) {
  const { ropingId } = await params;
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
        ropingId={ropingId}
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
        mainRoundsComplete
        canEdit={false}
      />
    );
  }

  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const { data: roping } = await supabase
    .from("ropings")
    .select(
      "id, title, status, result_status, roping_divisions!roping_divisions_roping_id_fkey(id, name, scheduled_date, sort_order, number_of_runs, short_round_enabled, short_round_seeded_at, timer_count, timer_resolution)",
    )
    .eq("id", ropingId)
    .eq("organization_id", organization.id)
    .single();
  if (!roping) notFound();

  const divisions = (
    roping.roping_divisions as unknown as Array<{
      id: string;
      name: string;
      scheduled_date: string;
      sort_order: number;
      number_of_runs: number;
      short_round_enabled: boolean;
      short_round_seeded_at: string | null;
      timer_count: number;
      timer_resolution: TimerResolution;
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
      numberOfRuns: division.number_of_runs,
      shortRoundEnabled: division.short_round_enabled,
      shortRoundSeeded: Boolean(division.short_round_seeded_at),
      timerCount: division.timer_count,
      timerResolution: division.timer_resolution,
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

  if (selectedDivisionId) {
    const { data: runData, error } = await supabase
      .from("runs")
      .select(
        "id, entry_id, draw_position, raw_time_seconds, penalty_seconds, status, entries!runs_entry_id_fkey!inner(entry_number, incentive_adjustment_seconds, people!inner(first_name, last_name))",
      )
      .eq("roping_division_id", selectedDivisionId)
      .eq("run_number", selectedRound)
      .order("draw_position", { ascending: true, nullsFirst: false });
    if (error)
      throw new Error(`Unable to load the event desk: ${error.message}`);
    runs = runData.map((run) => {
      const entry = run.entries as unknown as {
        entry_number: number;
        incentive_adjustment_seconds: number;
        people: { first_name: string; last_name: string };
      };
      return {
        id: run.id,
        entryId: run.entry_id,
        drawPosition: run.draw_position,
        name: `${entry.people.first_name} ${entry.people.last_name}`,
        entryNumber: entry.entry_number,
        rawTime:
          run.raw_time_seconds === null ? null : Number(run.raw_time_seconds),
        penalty: Number(run.penalty_seconds),
        incentiveAdjustment: Number(entry.incentive_adjustment_seconds),
        carryTime: null,
        status: run.status,
      };
    });
    if (
      selectedDivision &&
      selectedRound > selectedDivision.numberOfRuns &&
      runs.length
    ) {
      const { data: mainRunData, error: aggregateError } = await supabase
        .from("runs")
        .select(
          "entry_id, raw_time_seconds, penalty_seconds, status, entries!runs_entry_id_fkey!inner(incentive_adjustment_seconds)",
        )
        .eq("roping_division_id", selectedDivisionId)
        .lte("run_number", selectedDivision.numberOfRuns)
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
          incentive_adjustment_seconds: number;
        };
        const adjustedTime = Math.max(
          Number(mainRun.raw_time_seconds) +
            Number(mainRun.penalty_seconds) -
            Number(entry.incentive_adjustment_seconds),
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
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("roping_division_id", selectedDivisionId)
      .lte("run_number", selectedDivision?.numberOfRuns ?? 1)
      .eq("status", "pending");
    if (pendingError)
      throw new Error(`Unable to check main rounds: ${pendingError.message}`);
    mainRoundsComplete = pendingMainCount === 0;
  }

  return (
    <LiveWorkspace
      ropingId={ropingId}
      title={roping.title}
      status={roping.status}
      resultStatus={roping.result_status}
      divisions={divisions}
      selectedDivisionId={selectedDivisionId}
      selectedRound={selectedRound}
      runs={runs}
      mainRoundsComplete={mainRoundsComplete}
      canEdit={organization.role !== "viewer"}
    />
  );
}

function LiveWorkspace({
  ropingId,
  title,
  status,
  resultStatus,
  divisions,
  selectedDivisionId,
  selectedRound,
  runs,
  mainRoundsComplete,
  canEdit,
}: {
  ropingId: string;
  title: string;
  status: string;
  resultStatus: string;
  divisions: LiveDivision[];
  selectedDivisionId?: string;
  selectedRound: number;
  runs: LiveRunRow[];
  mainRoundsComplete: boolean;
  canEdit: boolean;
}) {
  const selectedDivision = divisions.find(
    (division) => division.id === selectedDivisionId,
  );
  const startAction = startRoping.bind(null, ropingId);
  const finalizeAction = finalizeRoping.bind(null, ropingId);

  return (
    <div className="space-y-6">
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
        <DatabaseLiveDesk
          key={`${selectedDivisionId}-${selectedRound}-${runs.map((run) => `${run.id}:${run.drawPosition}:${run.status}`).join("|")}`}
          ropingId={ropingId}
          divisions={divisions}
          selectedDivisionId={selectedDivisionId}
          selectedRound={selectedRound}
          runs={runs}
          timerCount={selectedDivision.timerCount}
          timerResolution={selectedDivision.timerResolution}
          eventStatus={status}
          isShortRound={selectedRound > selectedDivision.numberOfRuns}
          shortRoundSeeded={selectedDivision.shortRoundSeeded}
          mainRoundsComplete={mainRoundsComplete}
          canEdit={canEdit}
        />
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
    timerCount: 2,
    timerResolution: "average",
  },
  {
    id: "breakaway-115",
    name: "Breakaway · 11.5",
    numberOfRuns: 1,
    shortRoundEnabled: false,
    shortRoundSeeded: false,
    timerCount: 2,
    timerResolution: "longest",
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
    carryTime: 22.64,
    status: "pending",
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
    carryTime: 22.08,
    status: "pending",
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
    carryTime: 21.15,
    status: "pending",
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
    carryTime: 20.42,
    status: "pending",
  },
];
