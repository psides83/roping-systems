"use client";
import { EntryLabel, useEntryLabelStyle } from "./entry-label";
import { formatEntryLabel } from "@/lib/entry-labels";

import Link from "next/link";
import { NavigationPending } from "@/components/ui/navigation-pending";
import { useActionState, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ListOrdered,
  LockKeyhole,
  LoaderCircle,
  Save,
  Search,
  SkipForward,
  Trophy,
} from "lucide-react";
import {
  generateDraw,
  completeRound,
  recordRun,
  saveDrawOrder,
  seedShortRound,
  type DrawOrderState,
  type LiveRunState,
} from "@/app/(app)/events/[eventId]/actions";
import { cn } from "@/lib/utils";
import { calculateFinalRunTime, resolveTimerReadings, formatFinalTimeAdjustment } from "@/lib/scoring";
import {
  isResolvedRunStatus,
  runStatusAbbreviations,
  runStatusLabels,
  type RunStatus,
} from "@/lib/run-status";
import { RunCorrectionDialog } from "@/components/events/run-correction-dialog";
import { RerunSchedulingDialog } from "@/components/events/rerun-scheduling-dialog";
import { CattleDrawPanel } from "@/components/events/cattle-draw-panel";
import {
  ClassOperationsDialog,
  classEventDayStatusLabels,
  type ClassEventDayStatus,
} from "@/components/events/class-operations-dialog";
import {
  ShortRoundFieldDialog,
  type ShortRoundCandidate,
} from "@/components/events/short-round-field-dialog";
import type { RoundOrderMethod } from "@/types/domain";
import { PenaltyChoices } from "@/components/events/penalty-choices";
import { penaltyTotal, type PenaltyOption } from "@/lib/penalties";

export interface LiveRunRow {
  id: string;
  entryId: string;
  drawPosition: number | null;
  name: string;
  entryNumber: number;
  rawTime: number | null;
  penalty: number;
  incentiveAdjustment: number;
  timerReadings: number[];
  carryTime: number | null;
  status: RunStatus;
  rerunCount: number;
  cattleTag: string | null;
  penaltyOptions?: PenaltyOption[];
  selectedPenaltyIds?: string[];
}

interface LiveDeskProps {
  eventId: string;
  arenaCount: number;
  divisions: Array<{
    id: string;
    name: string;
    numberOfRuns: number;
    shortRoundEnabled: boolean;
    shortRoundSeeded: boolean;
    shortRoundLocked: boolean;
    secondRoundOrdering: RoundOrderMethod;
    laterRoundOrdering: RoundOrderMethod;
    cattleDrawEnabled: boolean;
    arenaName: string | null;
    eventDayStatus: ClassEventDayStatus;
    estimatedStart: string;
    eventDayNote: string | null;
  }>;
  selectedDivisionId: string;
  selectedRound: number;
  runs: LiveRunRow[];
  cattleTags: string[];
  shortRoundCandidates: ShortRoundCandidate[];
  roundLocked: boolean;
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
  eventStatus: string;
  isShortRound: boolean;
  shortRoundSeeded: boolean;
  mainRoundsComplete: boolean;
  canEdit: boolean;
}

export function DatabaseLiveDesk({
  eventId,
  arenaCount,
  divisions,
  selectedDivisionId,
  selectedRound,
  runs,
  cattleTags,
  shortRoundCandidates,
  roundLocked,
  timerCount,
  timerResolution,
  eventStatus,
  isShortRound,
  shortRoundSeeded,
  mainRoundsComplete,
  canEdit,
}: LiveDeskProps) {
  const [orderedRuns, setOrderedRuns] = useState(runs);
  const [search, setSearch] = useState("");
  const drawAction = generateDraw.bind(null, eventId);
  const [drawState, drawFormAction, drawPending] = useActionState<DrawOrderState, FormData>(drawAction, {});
  const orderAction = saveDrawOrder.bind(null, eventId);
  const [orderState, orderFormAction, orderPending] = useActionState<
    DrawOrderState,
    FormData
  >(orderAction, {});
  const shortRoundAction = seedShortRound.bind(null, eventId);
  const [shortRoundState, shortRoundFormAction, shortRoundPending] =
    useActionState<LiveRunState, FormData>(shortRoundAction, {});
  const completeRoundAction = completeRound.bind(null, eventId);
  const [roundState, roundFormAction, roundPending] = useActionState<
    LiveRunState,
    FormData
  >(completeRoundAction, {});

  const selectedDivision = divisions.find(
    (division) => division.id === selectedDivisionId,
  );
  const totalRounds =
    (selectedDivision?.numberOfRuns ?? 0) +
    (selectedDivision?.shortRoundEnabled ? 1 : 0);
  const drawReady =
    orderedRuns.length > 0 &&
    orderedRuns.every((run) => run.drawPosition !== null);
  const drawLocked = orderedRuns.some((run) => run.status !== "pending");
  const canManageDraw =
    canEdit && !drawLocked && !isShortRound && orderedRuns.length > 0;
  const dirty = orderedRuns.some((run, index) => run.id !== runs[index]?.id);
  const pendingRuns = orderedRuns.filter((run) => run.status === "pending");
  const currentRun =
    eventStatus === "in_progress" && drawReady && !dirty
      ? (pendingRuns[0] ?? null)
      : null;
  const upcomingRuns = currentRun ? pendingRuns.slice(1, 3) : [];
  const completeCount = orderedRuns.filter((run) =>
    isResolvedRunStatus(run.status),
  ).length;
  const rerunCount = orderedRuns.filter((run) => run.status === "rerun").length;
  const cattleDrawEnabled = selectedDivision?.cattleDrawEnabled ?? false;
  const assignedCattleCount = orderedRuns.filter(
    (run) => run.cattleTag !== null,
  ).length;
  const roundReadyToLock =
    orderedRuns.length > 0 &&
    orderedRuns.every((run) => isResolvedRunStatus(run.status));
  const selectedOrderMethod =
    selectedRound === 2
      ? selectedDivision?.secondRoundOrdering
      : selectedDivision?.laterRoundOrdering;
  const orderMethod =
    selectedRound === 1
      ? "First entries rope last"
      : selectedOrderMethod === "reverse_first"
        ? "Reverse of the first-round order"
        : selectedOrderMethod === "custom"
          ? "Custom order · build a starting list, then move contestants"
          : "Fewest qualified times first, then slowest aggregate to fastest";
  const normalizedSearch = search.trim().toLowerCase();
  const entryLabelStyle = useEntryLabelStyle();
  const visibleRuns = normalizedSearch
    ? orderedRuns.filter(
        (run) =>
          run.name.toLowerCase().includes(normalizedSearch) ||
          String(run.entryNumber).includes(normalizedSearch) ||
          formatEntryLabel(run.entryNumber, entryLabelStyle).toLowerCase().includes(normalizedSearch),
      )
    : orderedRuns;

  function moveRun(runId: string, direction: -1 | 1) {
    setOrderedRuns((current) => {
      const index = current.findIndex((run) => run.id === runId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4 border-y border-[#dfe4e1] py-4 sm:grid-cols-4">
        {[
          ["Runs resolved", `${completeCount} of ${orderedRuns.length}`],
          ["Remaining", String(pendingRuns.length)],
          ["Reruns required", String(rerunCount)],
          ["Round", `${selectedRound} of ${totalRounds}`],
        ].map(([label, value]) => (
          <div key={label}><dt className="text-xs font-semibold text-[#66716b]">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>
        ))}
      </dl>
      {roundLocked && selectedRound < totalRounds ? (
        <Link href={`/events/${eventId}/live?division=${selectedDivisionId}&round=${selectedRound + 1}`}
          className="inline-flex items-center gap-2 text-sm font-semibold">
          {selectedRound === selectedDivision?.numberOfRuns ? "Go to short round" : `Go to round ${selectedRound + 1}`} <SkipForward size={16} />
        </Link>
      ) : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="order-2 overflow-hidden rounded-md border border-[#dfe4e1] bg-white xl:order-1">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e7ebe8] p-4">
          <div>
            <h2 className="font-bold">{selectedDivision?.name}</h2>
            <p className="mt-1 text-xs text-[#758078]">
              {isShortRound ? "Short round" : `Round ${selectedRound}`} ·{" "}
              {orderedRuns.length} entries
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase">
              {selectedDivision?.arenaName ? (
                <span className="rounded-md bg-[#eef1ef] px-2 py-1 text-[#526059]">
                  {selectedDivision.arenaName}
                </span>
              ) : null}
              {selectedDivision?.eventDayStatus !== "scheduled" ? (
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                  {
                    classEventDayStatusLabels[
                      selectedDivision?.eventDayStatus ?? "scheduled"
                    ]
                  }
                </span>
              ) : null}
              {selectedDivision?.eventDayNote ? (
                <span className="normal-case text-amber-800">
                  {selectedDivision.eventDayNote}
                </span>
              ) : null}
            </div>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search draw"
              className="w-40 bg-transparent text-xs text-[#17201c] outline-none"
              placeholder="Find contestant"
            />
          </label>
        </div>

        {totalRounds > 1 ? (
          <nav className="flex gap-1 overflow-x-auto border-b border-[#e7ebe8] px-4 pt-3">
            {Array.from({ length: totalRounds }, (_, index) => index + 1).map(
              (round) => (
                <Link
                  key={round}
                  href={`/events/${eventId}/live?division=${selectedDivisionId}&round=${round}`}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-xs font-bold",
                    round === selectedRound
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  {round > (selectedDivision?.numberOfRuns ?? 0)
                    ? "Short round"
                    : `Round ${round}`}
                  <NavigationPending label="Loading round" />
                </Link>
              ),
            )}
          </nav>
        ) : null}

        <div className="border-b border-[#e7ebe8] bg-[#fafbfa] px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#758078]">
              {isShortRound && drawReady
                ? "Slowest aggregate runs first · leader runs last"
                : drawLocked
                  ? "Draw locked after results were entered"
                  : drawReady
                    ? dirty
                      ? "Unsaved order changes"
                      : orderMethod
                    : `Order not built · ${orderMethod}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {roundLocked ? (
                <span className="flex h-8 items-center gap-2 rounded-md bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                  <LockKeyhole size={14} /> Round locked
                </span>
              ) : roundReadyToLock && drawReady ? (
                <form action={roundFormAction}>
                  <input
                    type="hidden"
                    name="divisionId"
                    value={selectedDivisionId}
                  />
                  <input type="hidden" name="runNumber" value={selectedRound} />
                  <button
                    disabled={
                      !canEdit || eventStatus !== "in_progress" || roundPending
                    }
                    className="flex h-8 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {roundPending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <LockKeyhole size={14} />
                    )}
                    Complete round
                  </button>
                </form>
              ) : null}
              {isShortRound && !shortRoundSeeded ? (
                <form action={shortRoundFormAction}>
                  <input
                    type="hidden"
                    name="divisionId"
                    value={selectedDivisionId}
                  />
                  <button
                    disabled={
                      !canEdit ||
                      !mainRoundsComplete ||
                      eventStatus !== "in_progress" ||
                      shortRoundPending
                    }
                    className="flex h-8 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {shortRoundPending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Trophy size={14} />
                    )}
                    Build short round
                  </button>
                </form>
              ) : null}
              {isShortRound && shortRoundSeeded ? (
                <ShortRoundFieldDialog
                  eventId={eventId}
                  divisionId={selectedDivisionId}
                  candidates={shortRoundCandidates}
                  locked={selectedDivision?.shortRoundLocked ?? false}
                  editable={
                    canEdit &&
                    eventStatus === "in_progress" &&
                    orderedRuns.every((run) => run.status === "pending")
                  }
                />
              ) : null}
              {dirty ? (
                <form action={orderFormAction}>
                  <input
                    type="hidden"
                    name="divisionId"
                    value={selectedDivisionId}
                  />
                  <input type="hidden" name="runNumber" value={selectedRound} />
                  {orderedRuns.map((run) => (
                    <input
                      key={run.id}
                      type="hidden"
                      name="runIds"
                      value={run.id}
                    />
                  ))}
                  <button
                    disabled={orderPending || !canManageDraw}
                    className="flex h-8 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {orderPending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    Save order
                  </button>
                </form>
              ) : null}
              {orderedRuns.length &&
              !isShortRound &&
              (!drawReady || selectedOrderMethod !== "custom") ? (
                <form action={drawFormAction}>
                  <input
                    type="hidden"
                    name="divisionId"
                    value={selectedDivisionId}
                  />
                  <input type="hidden" name="runNumber" value={selectedRound} />
                  <button
                    disabled={!canManageDraw || drawPending}
                    className="flex h-8 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    {drawPending ? <LoaderCircle size={14} className="animate-spin" /> : <ListOrdered size={14} />}
                    {selectedOrderMethod === "custom"
                      ? "Build starting order"
                      : drawReady
                        ? "Rebuild order"
                        : "Build order"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          {drawState.message ? <p aria-live="polite" className={`mt-2 text-xs ${drawState.success ? "text-emerald-700" : "text-rose-700"}`}>{drawState.message}</p> : null}
          {orderState.message ? (
            <p
              className={`mt-2 text-xs ${orderState.success ? "text-emerald-700" : "text-rose-700"}`}
              aria-live="polite"
            >
              {orderState.message}
            </p>
          ) : null}
          {shortRoundState.message ? (
            <p
              className={`mt-2 text-xs ${shortRoundState.success ? "text-emerald-700" : "text-rose-700"}`}
              aria-live="polite"
            >
              {shortRoundState.message}
            </p>
          ) : null}
          {roundState.message ? (
            <p
              className={`mt-2 text-xs ${roundState.success ? "text-emerald-700" : "text-rose-700"}`}
              aria-live="polite"
            >
              {roundState.message}
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="w-28 px-5 py-3">Draw</th>
                <th className="px-5 py-3">Contestant</th>
                <th className="px-5 py-3">Entry</th>
                {cattleDrawEnabled ? (
                  <th className="px-5 py-3">Cattle</th>
                ) : null}
                {isShortRound ? (
                  <th className="px-5 py-3 text-right">Carry</th>
                ) : null}
                <th className="px-5 py-3 text-right">Time</th>
                <th className="px-5 py-3 text-right">Penalty</th>
                <th className="px-5 py-3 text-right">Incentive</th>
                <th className="px-5 py-3 text-right">
                  {isShortRound ? "Aggregate" : "Total"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ebe8]">
              {visibleRuns.map((run) => {
                const orderIndex = orderedRuns.findIndex(
                  (orderedRun) => orderedRun.id === run.id,
                );
                return (
                  <tr
                    key={run.id}
                    className={cn(
                      currentRun?.id === run.id &&
                        "bg-[#fff6f2] ring-1 ring-inset ring-[#e8ad9c]",
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-5 font-mono text-sm font-bold">
                          {drawReady ? orderIndex + 1 : "-"}
                        </span>
                        {canManageDraw && drawReady && !normalizedSearch ? (
                          <span className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => moveRun(run.id, -1)}
                              disabled={orderIndex === 0}
                              aria-label={`Move ${run.name} up`}
                              title="Move up"
                              className="grid h-7 w-7 place-items-center rounded-md border border-[#d7ddda] bg-white disabled:opacity-30"
                            >
                              <ArrowUp size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRun(run.id, 1)}
                              disabled={orderIndex === orderedRuns.length - 1}
                              aria-label={`Move ${run.name} down`}
                              title="Move down"
                              className="grid h-7 w-7 place-items-center rounded-md border border-[#d7ddda] bg-white disabled:opacity-30"
                            >
                              <ArrowDown size={13} />
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{run.name}</p>
                          {run.status !== "pending" ? (
                            <p
                              className={cn(
                                "mt-1 text-[10px] font-bold uppercase",
                                run.status === "complete"
                                  ? "text-emerald-700"
                                  : run.status === "rerun"
                                    ? "text-amber-700"
                                    : "text-[#758078]",
                              )}
                            >
                              {runStatusLabels[run.status]}
                            </p>
                          ) : run.rerunCount ? (
                            <p className="mt-1 text-[10px] font-bold uppercase text-amber-700">
                              Rerun {run.rerunCount}
                            </p>
                          ) : null}
                        </div>
                        {run.status !== "pending" ? (
                          <div className="flex items-center gap-2">
                            {run.status === "rerun" ? (
                              <RerunSchedulingDialog
                                eventId={eventId}
                                run={run}
                                canEdit={
                                  canEdit && eventStatus === "in_progress"
                                }
                              />
                            ) : null}
                            <RunCorrectionDialog
                              eventId={eventId}
                              run={run}
                              timerCount={timerCount}
                              canEdit={canEdit && eventStatus === "in_progress"}
                            />
                          </div>
                        ) : null}
                      </div>
                      {currentRun?.id === run.id ? (
                        <p className="mt-1 text-[10px] font-bold uppercase text-[var(--brand-accent-strong)]">
                          In the box
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-sm"><EntryLabel number={run.entryNumber} /></td>
                    {cattleDrawEnabled ? (
                      <td className="px-5 py-4 font-mono text-sm font-bold">
                        {run.cattleTag ?? "-"}
                      </td>
                    ) : null}
                    {isShortRound ? (
                      <td className="px-5 py-4 text-right font-mono text-sm font-semibold">
                        {run.carryTime?.toFixed(2) ?? "-"}
                      </td>
                    ) : null}
                    <td className="px-5 py-4 text-right font-mono text-sm font-semibold">
                      {run.status === "complete"
                        ? run.rawTime?.toFixed(2)
                        : runStatusAbbreviations[run.status]}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm">
                      {run.penalty ? `+${run.penalty}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-emerald-700">
                      {run.incentiveAdjustment
                        ? formatFinalTimeAdjustment(run.incentiveAdjustment)
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold">
                      {run.status === "complete" && run.rawTime !== null
                        ? ((run.carryTime ?? 0) + calculateFinalRunTime(
                            run.rawTime, run.penalty, run.incentiveAdjustment,
                          )).toFixed(2)
                        : runStatusAbbreviations[run.status]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleRuns.length ? (
            <div className="p-10 text-center text-sm text-[#758078]">
              {orderedRuns.length
                ? "No contestants match this search."
                : isShortRound
                  ? shortRoundSeeded
                    ? "No entries qualified for this short round."
                    : "Build the short round after all main rounds are complete."
                  : "No entries have been added to this class."}
            </div>
          ) : null}
        </div>
        <div className="border-t border-[#e7ebe8] bg-[#fafbfa] px-5 py-3 text-xs text-[#758078]">
          {completeCount} resolved · {pendingRuns.length} remaining
          {rerunCount ? ` · ${rerunCount} rerun required` : ""}
        </div>
      </section>

      <aside className="order-1 space-y-4 xl:order-2">
        {selectedDivision ? (
          <ClassOperationsDialog
            eventId={eventId}
            divisionId={selectedDivisionId}
            className={selectedDivision.name}
            arenaName={selectedDivision.arenaName}
            arenaCount={arenaCount}
            status={selectedDivision.eventDayStatus}
            estimatedStart={selectedDivision.estimatedStart}
            note={selectedDivision.eventDayNote}
            editable={canEdit && eventStatus !== "completed"}
          />
        ) : null}
        {cattleDrawEnabled ? (
          <CattleDrawPanel
            eventId={eventId}
            divisionId={selectedDivisionId}
            runNumber={selectedRound}
            cattleTags={cattleTags}
            assignedCount={assignedCattleCount}
            runCount={orderedRuns.length}
            canEdit={canEdit}
            canRedraw={orderedRuns.every((run) =>
              ["pending", "rerun"].includes(run.status),
            )}
          />
        ) : null}
        {drawReady && !dirty ? (
          <ArenaQueue current={currentRun} upcoming={upcomingRuns} />
        ) : null}
        {currentRun ? (
          <RunEntryForm
            key={currentRun.id}
            eventId={eventId}
            run={currentRun}
            timerCount={timerCount}
            timerResolution={timerResolution}
            isShortRound={isShortRound}
            canEdit={canEdit}
          />
        ) : (
          <DeskMessage
            title={
              !orderedRuns.length
                ? isShortRound
                  ? shortRoundSeeded
                    ? "No qualifiers"
                    : "Short round not built"
                  : "Waiting for entries"
                : !drawReady
                  ? "Draw required"
                  : dirty
                    ? "Save the draw"
                    : roundLocked
                      ? "Round locked"
                      : rerunCount
                        ? "Reruns required"
                        : eventStatus !== "in_progress"
                          ? "Ready to start"
                          : "Round complete"
            }
            message={
              !orderedRuns.length
                ? isShortRound
                  ? shortRoundSeeded
                    ? "No entry completed every main round with a qualified time."
                    : mainRoundsComplete
                      ? "Build the field from the completed main-round aggregate."
                      : "Complete every main-round run before building the finalist field."
                  : "Add contestants before generating a draw."
                : !drawReady
                  ? "Generate the draw and make any order adjustments before starting this round."
                  : dirty
                    ? "Save order changes before recording another result."
                    : roundLocked
                      ? "This round is complete. Corrections require a reason and remain available in the changelog."
                      : rerunCount
                        ? `${rerunCount} ${rerunCount === 1 ? "run requires" : "runs require"} a rerun before this round can be completed.`
                        : eventStatus !== "in_progress"
                          ? "The draw is ready. Start the event when the arena is ready."
                          : "Every run in this round has a result."
            }
          />
        )}
        <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-bold uppercase text-[#758078]">Classes</p>
          <div className="mt-3 space-y-1">
            {divisions.map((division) => (
              <Link
                key={division.id}
                href={`/events/${eventId}/live?division=${division.id}&round=1`}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold",
                  division.id === selectedDivisionId
                    ? "brand-primary-fill text-white"
                    : "hover:bg-[#f1f3f2]",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">{division.name}<NavigationPending label="Loading roping" /></span>
                <span className="text-[10px] opacity-75">
                  {division.numberOfRuns}R
                  {division.shortRoundEnabled ? " + Final" : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
}

function ArenaQueue({
  current,
  upcoming,
}: {
  current: LiveRunRow | null;
  upcoming: LiveRunRow[];
}) {
  if (!current && !upcoming.length) return null;
  return (
    <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <div className="brand-primary-fill px-4 py-3 text-white">
        <p className="text-[10px] font-bold uppercase opacity-75">In the box</p>
        <p className="mt-1 truncate text-lg font-bold">
          {current?.name ?? "Round complete"}
        </p>
        {current ? (
          <p className="mt-1 text-xs opacity-80">
            Draw {current.drawPosition} · Entry <EntryLabel number={current.entryNumber} />
            {current.cattleTag ? ` · Cattle ${current.cattleTag}` : ""}
            {current.rerunCount ? ` · Rerun ${current.rerunCount}` : ""}
          </p>
        ) : null}
      </div>
      {upcoming.length ? (
        <div className="divide-y divide-[#e7ebe8]">
          {upcoming.map((run, index) => (
            <div
              key={run.id}
              className="grid grid-cols-[74px_1fr_auto] items-center gap-2 px-4 py-3 text-sm"
            >
              <span className="text-[10px] font-bold uppercase text-[#758078]">
                {index === 0 ? "On deck" : "Next up"}
              </span>
              <span className="min-w-0 truncate font-semibold">{run.name}</span>
              <span className="font-mono text-xs text-[#66716b]">
                <EntryLabel number={run.entryNumber} />
                {run.cattleTag ? ` · C${run.cattleTag}` : ""}
                {run.rerunCount ? ` · R${run.rerunCount}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DeskMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-[#dfe4e1] bg-white p-6 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#758078]">{message}</p>
    </div>
  );
}

function RunEntryForm({
  eventId,
  run,
  timerCount,
  timerResolution,
  isShortRound,
  canEdit,
}: {
  eventId: string;
  run: LiveRunRow;
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
  isShortRound: boolean;
  canEdit: boolean;
}) {
  const action = recordRun.bind(null, eventId);
  const [state, formAction, pending] = useActionState<LiveRunState, FormData>(
    action,
    {},
  );
  const [times, setTimes] = useState<string[]>(() =>
    Array.from({ length: timerCount }, () => ""),
  );
  const [selectedPenalties, setSelectedPenalties] = useState<string[]>([]);
  const penalty = penaltyTotal(run.penaltyOptions ?? [], selectedPenalties);
  const resolved = useMemo(() => {
    return resolveTimerReadings(times, timerResolution);
  }, [times, timerResolution]);
  const adjustedRunTime =
    resolved === null
      ? "--.---"
      : calculateFinalRunTime(resolved, Number(penalty), run.incentiveAdjustment).toFixed(2);
  const aggregateTotal =
    resolved === null || run.carryTime === null
      ? "--.---"
      : (
          run.carryTime +
          calculateFinalRunTime(resolved, Number(penalty), run.incentiveAdjustment)
        ).toFixed(2);
  const methodLabel =
    timerResolution === "best"
      ? "Fastest reading"
      : timerResolution === "longest"
        ? "Longest reading"
        : "Average reading";

  return (
    <form
      action={formAction}
      className="rounded-md border border-[#e0c2b9] bg-white p-5"
    >
      <input type="hidden" name="runId" value={run.id} />
      <input type="hidden" name="penalty" value={penalty} />
      <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
        Draw {run.drawPosition ?? "-"} · Entry <EntryLabel number={run.entryNumber} />
        {run.cattleTag ? ` · Cattle ${run.cattleTag}` : ""}
        {run.rerunCount ? ` · Rerun ${run.rerunCount}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mt-1 text-xl font-bold">{run.name}</h2>
        {run.incentiveAdjustment ? (
          <span className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
            {formatFinalTimeAdjustment(run.incentiveAdjustment)} sec handicap
          </span>
        ) : null}
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-[#66716b]">
            Timer readings
          </p>
          <p className="text-[10px] font-semibold text-[#758078]">
            {methodLabel}
          </p>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {times.map((time, index) => (
            <label
              key={index}
              className="flex items-center gap-3 rounded-md border-2 border-[#bec7c2] px-3 focus-within:border-[var(--brand-accent)]"
            >
              <span className="text-xs font-bold text-[#758078]">
                T{index + 1}
              </span>
              <input
                name="timerReading"
                type="number"
                min="0"
                step="0.01"
                aria-label={`Timer ${index + 1}`}
                autoFocus={index === 0 && canEdit}
                inputMode="decimal"
                value={time}
                onChange={(event) =>
                  setTimes((current) =>
                    current.map((value, timerIndex) =>
                      timerIndex === index ? event.target.value : value,
                    ),
                  )
                }
                disabled={!canEdit}
                className="h-14 min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold outline-none placeholder:text-[#c9cecb] disabled:opacity-60"
                placeholder="0.00"
              />
              <span className="text-xs font-semibold text-[#758078]">sec</span>
            </label>
          ))}
        </div>
      </div>
      <PenaltyChoices options={run.penaltyOptions ?? []} selected={selectedPenalties} onChange={setSelectedPenalties} disabled={!canEdit} />
      <div className="mt-5 flex items-center justify-between border-y border-[#e7ebe8] py-4">
        <span>
          <span className="block text-sm font-semibold text-[#66716b]">
            {isShortRound ? "Projected aggregate" : "Final run time"}
          </span>
          {isShortRound && run.carryTime !== null ? (
            <span className="mt-1 block text-[10px] font-semibold text-[#758078]">
              {run.carryTime.toFixed(2)} carry + {adjustedRunTime} run
            </span>
          ) : null}
          {run.incentiveAdjustment ? (
            <span className="mt-1 block text-[10px] font-semibold text-emerald-700">
              Includes {formatFinalTimeAdjustment(run.incentiveAdjustment)} sec
              handicap
            </span>
          ) : null}
        </span>
        <span className="font-mono text-2xl font-bold">
          {isShortRound ? aggregateTotal : adjustedRunTime}
        </span>
      </div>
      {state.message ? (
        <p
          className={`mt-3 rounded-md p-3 text-xs ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button
        name="status"
        value="complete"
        disabled={!canEdit || pending || resolved === null}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md brand-accent-fill text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <Save size={18} />
        )}
        Save & next run
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          name="status"
          value="no_time"
          disabled={!canEdit || pending}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          <AlertCircle size={15} /> No time
        </button>
        <button
          name="status"
          value="disqualified"
          disabled={!canEdit || pending}
          className="flex h-10 items-center justify-center rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          Disqualified
        </button>
        <button
          name="status"
          value="turned_out"
          disabled={!canEdit || pending}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          <SkipForward size={15} /> Turn out
        </button>
        <button
          name="status"
          value="rerun"
          disabled={!canEdit || pending}
          className="flex h-10 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900 disabled:opacity-50"
        >
          Rerun required
        </button>
      </div>
    </form>
  );
}
