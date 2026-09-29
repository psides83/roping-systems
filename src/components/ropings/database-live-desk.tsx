"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  LoaderCircle,
  Save,
  Search,
  Shuffle,
  SkipForward,
  Trophy,
} from "lucide-react";
import {
  generateDraw,
  recordRun,
  saveDrawOrder,
  seedShortRound,
  type DrawOrderState,
  type LiveRunState,
} from "@/app/(app)/ropings/[ropingId]/actions";
import { cn } from "@/lib/utils";

export interface LiveRunRow {
  id: string;
  entryId: string;
  drawPosition: number | null;
  name: string;
  entryNumber: number;
  rawTime: number | null;
  penalty: number;
  incentiveAdjustment: number;
  carryTime: number | null;
  status: string;
}

interface LiveDeskProps {
  ropingId: string;
  divisions: Array<{
    id: string;
    name: string;
    numberOfRuns: number;
    shortRoundEnabled: boolean;
    shortRoundSeeded: boolean;
  }>;
  selectedDivisionId: string;
  selectedRound: number;
  runs: LiveRunRow[];
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
  eventStatus: string;
  isShortRound: boolean;
  shortRoundSeeded: boolean;
  mainRoundsComplete: boolean;
  canEdit: boolean;
}

export function DatabaseLiveDesk({
  ropingId,
  divisions,
  selectedDivisionId,
  selectedRound,
  runs,
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
  const drawAction = generateDraw.bind(null, ropingId);
  const orderAction = saveDrawOrder.bind(null, ropingId);
  const [orderState, orderFormAction, orderPending] = useActionState<
    DrawOrderState,
    FormData
  >(orderAction, {});
  const shortRoundAction = seedShortRound.bind(null, ropingId);
  const [shortRoundState, shortRoundFormAction, shortRoundPending] =
    useActionState<LiveRunState, FormData>(shortRoundAction, {});

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
  const currentRun =
    eventStatus === "in_progress" && drawReady && !dirty
      ? (orderedRuns.find((run) => run.status === "pending") ?? null)
      : null;
  const completeCount = orderedRuns.filter(
    (run) => run.status !== "pending",
  ).length;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRuns = normalizedSearch
    ? orderedRuns.filter(
        (run) =>
          run.name.toLowerCase().includes(normalizedSearch) ||
          String(run.entryNumber).includes(normalizedSearch),
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="order-2 overflow-hidden rounded-md border border-[#dfe4e1] bg-white xl:order-1">
        <div className="flex flex-col gap-4 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold">{selectedDivision?.name}</h2>
            <p className="mt-1 text-xs text-[#758078]">
              {isShortRound ? "Short round" : `Round ${selectedRound}`} ·{" "}
              {orderedRuns.length} entries
            </p>
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
                  href={`/ropings/${ropingId}/live?division=${selectedDivisionId}&round=${round}`}
                  className={cn(
                    "border-b-2 px-4 py-2 text-xs font-bold",
                    round === selectedRound
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  {round > (selectedDivision?.numberOfRuns ?? 0)
                    ? "Short round"
                    : `Round ${round}`}
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
                      : "Draw order is set"
                    : "Draw has not been generated"}
            </p>
            <div className="flex flex-wrap gap-2">
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
              {orderedRuns.length && !isShortRound ? (
                <form action={drawAction}>
                  <input
                    type="hidden"
                    name="divisionId"
                    value={selectedDivisionId}
                  />
                  <input type="hidden" name="runNumber" value={selectedRound} />
                  <button
                    disabled={!canManageDraw}
                    className="flex h-8 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    <Shuffle size={14} />
                    {drawReady ? "Regenerate draw" : "Generate draw"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="w-28 px-5 py-3">Draw</th>
                <th className="px-5 py-3">Contestant</th>
                <th className="px-5 py-3">Entry</th>
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
                      <p className="text-sm font-semibold">{run.name}</p>
                      {currentRun?.id === run.id ? (
                        <p className="mt-1 text-[10px] font-bold uppercase text-[var(--brand-accent-strong)]">
                          In the box
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-sm">#{run.entryNumber}</td>
                    {isShortRound ? (
                      <td className="px-5 py-4 text-right font-mono text-sm font-semibold">
                        {run.carryTime?.toFixed(3) ?? "-"}
                      </td>
                    ) : null}
                    <td className="px-5 py-4 text-right font-mono text-sm font-semibold">
                      {run.status === "complete"
                        ? run.rawTime?.toFixed(3)
                        : run.status === "no_time"
                          ? "NT"
                          : run.status === "scratch"
                            ? "SCR"
                            : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm">
                      {run.penalty ? `+${run.penalty}` : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-emerald-700">
                      {run.incentiveAdjustment
                        ? `-${run.incentiveAdjustment.toFixed(3)}`
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold">
                      {run.status === "complete" && run.rawTime !== null
                        ? Math.max(
                            (run.carryTime ?? 0) +
                              run.rawTime +
                              run.penalty -
                              run.incentiveAdjustment,
                            0,
                          ).toFixed(3)
                        : run.status === "no_time"
                          ? "NT"
                          : run.status === "scratch"
                            ? "SCR"
                            : "-"}
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
          {completeCount} completed · {orderedRuns.length - completeCount}{" "}
          remaining
        </div>
      </section>

      <aside className="order-1 space-y-4 xl:order-2">
        {currentRun ? (
          <RunEntryForm
            key={currentRun.id}
            ropingId={ropingId}
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
                href={`/ropings/${ropingId}/live?division=${division.id}&round=1`}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold",
                  division.id === selectedDivisionId
                    ? "brand-primary-fill text-white"
                    : "hover:bg-[#f1f3f2]",
                )}
              >
                <span>{division.name}</span>
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
  ropingId,
  run,
  timerCount,
  timerResolution,
  isShortRound,
  canEdit,
}: {
  ropingId: string;
  run: LiveRunRow;
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
  isShortRound: boolean;
  canEdit: boolean;
}) {
  const action = recordRun.bind(null, ropingId);
  const [state, formAction, pending] = useActionState<LiveRunState, FormData>(
    action,
    {},
  );
  const [times, setTimes] = useState<string[]>(() =>
    Array.from({ length: timerCount }, () => ""),
  );
  const [penalty, setPenalty] = useState("0");
  const resolved = useMemo(() => {
    const values = times.map(Number);
    if (times.some((value) => !value) || values.some(Number.isNaN)) return null;
    if (timerResolution === "best") return Math.min(...values);
    if (timerResolution === "longest") return Math.max(...values);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [times, timerResolution]);
  const adjustedRunTime =
    resolved === null
      ? "--.---"
      : Math.max(
          resolved + Number(penalty) - run.incentiveAdjustment,
          0,
        ).toFixed(3);
  const aggregateTotal =
    resolved === null || run.carryTime === null
      ? "--.---"
      : (
          run.carryTime +
          Math.max(resolved + Number(penalty) - run.incentiveAdjustment, 0)
        ).toFixed(3);
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
        Draw {run.drawPosition ?? "-"} · Entry {run.entryNumber}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mt-1 text-xl font-bold">{run.name}</h2>
        {run.incentiveAdjustment ? (
          <span className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
            -{run.incentiveAdjustment.toFixed(3)} sec incentive
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
                placeholder="0.000"
              />
              <span className="text-xs font-semibold text-[#758078]">sec</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-bold uppercase text-[#66716b]">Penalty</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {["0", "5", "10"].map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setPenalty(value)}
              disabled={!canEdit}
              className={cn(
                "h-11 rounded-md border text-sm font-bold disabled:opacity-50",
                penalty === value
                  ? "border-[var(--brand-primary)] brand-primary-fill text-white"
                  : "border-[#d7ddda]",
              )}
            >
              {value === "0" ? "None" : `+${value}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-y border-[#e7ebe8] py-4">
        <span>
          <span className="block text-sm font-semibold text-[#66716b]">
            {isShortRound ? "Projected aggregate" : "Official time"}
          </span>
          {isShortRound && run.carryTime !== null ? (
            <span className="mt-1 block text-[10px] font-semibold text-[#758078]">
              {run.carryTime.toFixed(3)} carry + {adjustedRunTime} run
            </span>
          ) : null}
          {run.incentiveAdjustment ? (
            <span className="mt-1 block text-[10px] font-semibold text-emerald-700">
              Includes -{run.incentiveAdjustment.toFixed(3)} sec incentive
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
          value="scratch"
          disabled={!canEdit || pending}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          <SkipForward size={15} /> Scratch
        </button>
      </div>
    </form>
  );
}
