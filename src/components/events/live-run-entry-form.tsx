"use client";
import { useTimingControl } from "./timing-control";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Save, SkipForward } from "lucide-react";
import { useTimerDraft } from "./use-timer-draft";
import { useNetworkStatus } from "./use-network-status";
import { submitTimerResult, timerSubmissionData, type TimerSaveResult } from "@/lib/events/submit-timer-result";
import type { TimerOutcome } from "@/lib/events/timer-drafts";
import { calculateFinalRunTime, resolveTimerReadings, formatFinalTimeAdjustment } from "@/lib/scoring";
import { penaltyTotal } from "@/lib/penalties";
import { PenaltyChoices } from "./penalty-choices";
import { EntryLabel, useEntryLabelStyle } from "./entry-label";
import { formatEntryLabel } from "@/lib/entry-labels";
import type { LiveRunRow } from "./database-live-desk";
import { useDeskLeaveGuard } from "./use-desk-leave-guard";

export function RunEntryForm({
  eventId,
  run,
  timerCount,
  timerResolution,
  isShortRound,
  canEdit: permitted,
  roundLabel,
  ropingName,
  ropingId,
  round,
}: {
  eventId: string;
  run: LiveRunRow;
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
  isShortRound: boolean;
  canEdit: boolean;
  roundLabel: string;
  ropingName: string;
  ropingId: string;
  round: number;
}) {
  const router = useRouter();
  const online = useNetworkStatus();
  const entryLabelStyle = useEntryLabelStyle();
  const timing = useTimingControl();
  const draft = useTimerDraft({ userId: timing.staffUserId, eventId, ropingId, round, runId: run.id,
    name: run.name, rerunCount: run.rerunCount ?? 0, recordedAt: run.recordedAt ?? null },timerCount);
  const canEdit = permitted && timing.canWrite && draft.ready && !draft.stale && !run.competitionHold;
  const [state, formAction, pending] = useActionState<TimerSaveResult, FormData>(
    async (_, data) => {
      const snapshot = draft.prepare(data.get("status") as TimerOutcome);
      const result = await submitTimerResult(eventId,run.id,timerSubmissionData(snapshot,timing.sessionId));
      draft.finish(result);
      if (result.success) router.refresh();
      return result;
    },
    {},
  );
  const times = draft.draft.times;
  const setTimes = draft.setTimes;
  const selectedPenalties = draft.draft.penalties;
  const setSelectedPenalties = draft.setPenalties;
  const submitting = useRef(false);
  const unsaved = !state.success && (times.some((time) => time !== "") || selectedPenalties.length > 0 || Boolean(draft.draft.submission));
  const editingBlocked = !canEdit || pending || Boolean(draft.draft.submission) || Boolean(state.success);
  useDeskLeaveGuard(unsaved || pending);
  useEffect(() => { if (!pending) submitting.current = false; }, [pending, state]);
  const penalty = penaltyTotal(run.penaltyOptions ?? [], selectedPenalties);
  const resolved = useMemo(() => {
    return resolveTimerReadings(times, timerResolution);
  }, [times, timerResolution]);
  const adjustedRunTime =
    resolved === null
      ? "--.--"
      : calculateFinalRunTime(resolved, Number(penalty), run.incentiveAdjustment).toFixed(2);
  const aggregateTotal =
    resolved === null || run.carryTime === null
      ? "--.--"
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
      aria-busy={pending}
      data-desk-unsaved={unsaved || pending ? "time" : undefined}
      data-desk-saving={pending}
      onSubmit={(event) => {
        if (!canEdit || !online || state.success || submitting.current || pending) { event.preventDefault(); return; }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const outcome = submitter instanceof HTMLButtonElement ? submitter.value : "complete";
        if (!draft.draft.submission && outcome === "complete" && resolved === 0 && !window.confirm(`The timer readings resolve to 0.00 seconds. Record a qualified time for ${run.name}?`)) { event.preventDefault(); return; }
        if (!draft.draft.submission && outcome !== "complete" && (outcome !== "no_time" || unsaved)) {
          const labels: Record<string, string> = { no_time: "No time", disqualified: "Disqualified", turned_out: "Turn out", rerun: "Rerun required" };
          if (!window.confirm(`Record ${labels[outcome] ?? outcome} for ${run.name}, ${roundLabel}, entry ${formatEntryLabel(run.entryNumber, entryLabelStyle)}?${unsaved ? " The entered timer readings will not count." : ""}`)) { event.preventDefault(); return; }
        }
        submitting.current = true;
      }}
      className="rounded-md border border-[#e0c2b9] bg-white p-5"
    >
      <input type="hidden" name="timingSessionId" value={timing.sessionId} />
      <input type="hidden" name="runId" value={run.id} />
      <input type="hidden" name="penalty" value={penalty} />
      <p className="mb-3 text-sm font-semibold text-[#526059]">{ropingName} · {roundLabel}</p>
      <div role="status" aria-live="polite" className={`mb-4 rounded-md border p-3 text-sm font-semibold ${!online || draft.storageError || draft.stale || state.uncertain ? "border-amber-300 bg-amber-50 text-amber-900" : "border-[#d7ddda] bg-[#f4f6f5] text-[#526059]"}`}>
        {pending ? "Saving result to server... Waiting for confirmation." : state.success ? "Saved to server." : draft.storageError ? "Draft is only held in this open page. Device storage could not be confirmed." : !online ? "Connection lost. Your draft stays on this device; reconnect before saving." : !draft.ready ? "Checking for a saved device draft..." : draft.stale ? "Recovered draft does not match this run's current setup. Review it before discarding." : draft.draft.submission ? "Save not confirmed. Retry the same result; the readings are held unchanged." : draft.restored ? "Recovered draft from this device. Review before saving." : unsaved ? "Draft saved on this device · Not yet saved to server" : "Ready for timer readings"}
        {draft.storageError ? <p role="alert" className="mt-2">{draft.storageError}</p> : null}
        {draft.stale ? <button type="button" onClick={draft.discard} className="mt-2 underline">Discard stale draft</button> : null}
        {draft.draft.submission?.uncertain && !pending ? <button type="button" onClick={draft.discard} className="mt-2 underline">Discard device draft</button> : null}
      </div>
      <p className="mb-1 text-xs font-bold uppercase text-[#66716b]">In the box</p>
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
        {run.competitionHold ? <div role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{run.competitionHold}{run.membershipId && <a href={`/members/${run.membershipId}`} className="mt-2 block underline">Review roper record</a>}</div> : null}
        {run.fineBlocked ? <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Competition blocked by an unpaid member fine. Record payment or approve a fine exception before this roper competes.</p> : null}
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
                autoFocus={index === 0 && canEdit && !run.fineBlocked}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const form = event.currentTarget.form;
                  const next = form?.querySelectorAll<HTMLInputElement>('input[name="timerReading"]')[index + 1];
                  if (next) next.focus();
                  else form?.querySelector<HTMLButtonElement>('button[value="complete"]')?.focus();
                }}
                inputMode="decimal"
                value={time}
                onChange={(event) =>
                  setTimes((current) =>
                    current.map((value, timerIndex) =>
                      timerIndex === index ? event.target.value : value,
                    ),
                  )
                }
                disabled={editingBlocked || run.fineBlocked}
                className="h-14 min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold outline-none placeholder:text-[#c9cecb] disabled:opacity-60"
                placeholder="0.00"
              />
              <span className="text-xs font-semibold text-[#758078]">sec</span>
            </label>
          ))}
        </div>
      </div>
      <PenaltyChoices options={run.penaltyOptions ?? []} selected={selectedPenalties} onChange={setSelectedPenalties} disabled={editingBlocked} />
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
          role={state.success ? "status" : "alert"}
          className={`mt-3 rounded-md p-3 text-xs ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
        >
          {state.message}
        </p>
      ) : null}
      <button
        name="status"
        value={draft.draft.submission?.outcome ?? "complete"}
        disabled={!canEdit || !online || pending || state.success || (!draft.draft.submission && (resolved === null || run.fineBlocked))}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md brand-accent-fill text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <Save size={18} />
        )}
        {pending ? "Saving result..." : state.success ? "Saved to server" : draft.draft.submission ? "Retry save & confirm result" : "Save time & next roper"}
      </button>
      <p className="mt-5 text-xs font-semibold text-[#66716b]">Other outcomes</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          name="status"
          value="no_time"
          formNoValidate
          disabled={editingBlocked || !online}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          <AlertCircle size={15} /> No time
        </button>
        <button
          name="status"
          value="disqualified"
          formNoValidate
          disabled={editingBlocked || !online}
          className="flex h-10 items-center justify-center rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          Disqualified
        </button>
        <button
          name="status"
          value="turned_out"
          formNoValidate
          disabled={editingBlocked || !online}
          className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold disabled:opacity-50"
        >
          <SkipForward size={15} /> Turn out
        </button>
        <button
          name="status"
          value="rerun"
          formNoValidate
          disabled={editingBlocked || !online}
          className="flex h-10 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900 disabled:opacity-50"
        >
          Rerun required
        </button>
      </div>
    </form>
  );
}
