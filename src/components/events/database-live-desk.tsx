"use client";
import { EntryLabel, useEntryLabelStyle } from "./entry-label";
import { formatEntryLabel } from "@/lib/entry-labels";
import { deskWorkflowState } from "@/lib/events/desk-workflow";
import { useTimingControl } from "./timing-control";
import { LiveDeskSelector } from "./live-desk-selector";
import { RunEntryForm } from "./live-run-entry-form";
import { LastRecordedRun } from "./last-recorded-run";
import { useDeskLeaveGuard } from "./use-desk-leave-guard";

import Link from "next/link";
import { NavigationPending } from "@/components/ui/navigation-pending";
import { useActionState, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
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
  saveDrawOrder,
  seedShortRound,
  type DrawOrderState,
  type LiveRunState,
} from "@/app/(app)/events/[eventId]/actions";
import { cn } from "@/lib/utils";
import { calculateFinalRunTime, formatFinalTimeAdjustment } from "@/lib/scoring";
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
import type { PenaltyOption } from "@/lib/penalties";

export interface LiveRunRow {
  recordedAt?: string | null;
  fineBlocked?: boolean;
  competitionHold?: string | null;
  membershipId?: string | null;
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
  canTime?: boolean;
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
  canTime: timingAllowed = canEdit,
}: LiveDeskProps) {
  const timing = useTimingControl();
  const canTime = timingAllowed && timing.canWrite;
  const [orderedRuns, setOrderedRuns] = useState(runs);
  const [search, setSearch] = useState("");
  const [deskChanging, setDeskChanging] = useState(false);
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
    canEdit && !roundLocked && eventStatus !== "completed" && eventStatus !== "cancelled" && selectedDivision?.eventDayStatus !== "completed" && !drawLocked && !isShortRound && orderedRuns.length > 0;
  const dirty = orderedRuns.some((run, index) => run.id !== runs[index]?.id);
  useDeskLeaveGuard(dirty || orderPending);
  const pendingRuns = orderedRuns.filter((run) => run.status === "pending");
  const workflowState = deskWorkflowState({
    eventStatus, roundLocked, drawReady, dirty, isShortRound,
    ropingStatus: selectedDivision?.eventDayStatus,
    shortRoundSeeded, mainRoundsComplete,
    shortRoundLocked: selectedDivision?.shortRoundLocked ?? false,
    runs: orderedRuns,
  });
  const currentRun =
    workflowState === null
      ? (pendingRuns[0] ?? null)
      : null;
  const upcomingRuns = currentRun ? pendingRuns.slice(1, 3) : [];
  const lastRecordedRun = orderedRuns.filter((run) => run.recordedAt && run.status !== "pending")
    .toSorted((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""))[0];
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
    <div className="space-y-5" data-desk-unsaved={dirty || orderPending ? "order" : undefined} data-desk-saving={orderPending}>
      <LiveDeskSelector eventId={eventId} ropings={divisions} selectedId={selectedDivisionId} round={selectedRound} onPendingChange={setDeskChanging} />
      <div inert={deskChanging} aria-busy={deskChanging} className={`space-y-5 ${deskChanging ? "pointer-events-none opacity-50" : ""}`}>
      <dl className="grid grid-cols-3 gap-3 border-y border-[#dfe4e1] py-3">
        {[
          ["Runs resolved", `${completeCount} of ${orderedRuns.length}`],
          ["Remaining", String(pendingRuns.length)],
          ["Reruns required", String(rerunCount)],
        ].map(([label, value]) => (
          <div key={label}><dt className="text-xs font-semibold text-[#66716b]">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>
        ))}
      </dl>
      {selectedDivision && eventStatus === "in_progress" && selectedDivision.eventDayStatus !== "completed" && mainRoundsComplete && orderedRuns.length > 0 && (!selectedDivision.shortRoundEnabled || (isShortRound && roundReadyToLock)) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-emerald-200 bg-emerald-50 p-4">
          <div><h2 className="text-sm font-bold">Ready to complete this roping</h2><p className="mt-1 text-xs text-[#66716b]">Mark the roping completed, then finalize its payouts on the Payouts page.</p></div>
          <ClassOperationsDialog eventId={eventId} divisionId={selectedDivisionId}
            className={selectedDivision.name} arenaName={selectedDivision.arenaName}
            arenaCount={arenaCount} status={selectedDivision.eventDayStatus}
            estimatedStart={selectedDivision.estimatedStart} note={selectedDivision.eventDayNote}
            editable={canEdit} suggestedStatus="completed" actionLabel="Complete roping" />
        </div>
      ) : null}
      {selectedDivision?.eventDayStatus === "completed" || eventStatus === "completed" ? (
        <Link href={`/events/${eventId}/payouts`} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold">Continue to payouts <SkipForward size={16} /></Link>
      ) : null}
      {dirty ? (
        <button type="button" onClick={() => setOrderedRuns(runs)}
          className="inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-semibold">
          Discard order changes
        </button>
      ) : null}
      {rerunCount > 0 && eventStatus === "in_progress" ? (
        <section aria-label="Reruns awaiting scheduling" className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold">Reruns awaiting scheduling</h2>
          <div className="mt-2 space-y-2">
            {orderedRuns.filter((run) => run.status === "rerun").map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{run.name} · <EntryLabel number={run.entryNumber} /></span>
                <RerunSchedulingDialog eventId={eventId} run={run} canEdit={canTime} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {roundLocked && selectedRound < totalRounds ? (
        <Link href={`/events/${eventId}/live?division=${selectedDivisionId}&round=${selectedRound + 1}`}
          className="inline-flex items-center gap-2 text-sm font-semibold">
          {selectedRound === selectedDivision?.numberOfRuns ? "Go to short round" : `Go to round ${selectedRound + 1}`} <SkipForward size={16} />
        </Link>
      ) : null}
      {workflowState !== null || canManageDraw ? (
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
                <form action={roundFormAction} onSubmit={(event) => {
                  if (!window.confirm(`Complete ${isShortRound ? "the short round" : `round ${selectedRound}`} for ${selectedDivision?.name}? All results will be locked; corrections will require a reason.`)) event.preventDefault();
                }}>
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
                    {roundPending ? "Completing round..." : "Complete round"}
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
                                  canTime && eventStatus === "in_progress"
                                }
                              />
                            ) : null}
                            <RunCorrectionDialog
                              eventId={eventId}
                              run={run}
                              timerCount={timerCount}
                              canEdit={canTime && eventStatus === "in_progress"}
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
        {currentRun ? (
          <RunEntryForm
            key={currentRun.id}
            eventId={eventId}
            run={currentRun}
            ropingId={selectedDivisionId}
            round={selectedRound}
            roundLabel={isShortRound ? "Short round" : `Round ${selectedRound}`}
            ropingName={selectedDivision?.name ?? ""}
            timerCount={timerCount}
            timerResolution={timerResolution}
            isShortRound={isShortRound}
            canEdit={canTime}
          />
        ) : (
          <DeskMessage
            title={workflowState?.title ?? "Review round"}
            message={workflowState?.message ?? "Review the run results before continuing."}
          />
        )}
        {lastRecordedRun ? <LastRecordedRun eventId={eventId} run={lastRecordedRun} timerCount={timerCount} canEdit={canTime && eventStatus === "in_progress"} /> : null}
        {drawReady && !dirty ? <ArenaQueue upcoming={upcomingRuns} /> : null}
        <details className="group border-y border-[#dfe4e1] py-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">Roping operations <ChevronDown size={17} className="transition-transform group-open:rotate-180" /></summary>
          <div className="mt-3 space-y-3">
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
          </div>
        </details>
      </aside>
    </div>
    </div>
    </div>
  );
}

function ArenaQueue({
  upcoming,
}: {
  upcoming: LiveRunRow[];
}) {
  if (!upcoming.length) return null;
  return (
    <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
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
