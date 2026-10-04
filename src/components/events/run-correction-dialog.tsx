"use client";

import { LoaderCircle, Pencil, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  correctRun,
  type LiveRunState,
} from "@/app/(app)/events/[eventId]/actions";
import { runStatusLabels, type RunStatus } from "@/lib/run-status";

interface CorrectableRun {
  id: string;
  name: string;
  entryNumber: number;
  status: RunStatus;
  penalty: number;
  timerReadings: number[];
}

const correctionOutcomes: RunStatus[] = [
  "complete",
  "no_time",
  "disqualified",
  "turned_out",
  "rerun",
];

export function RunCorrectionDialog({
  eventId,
  run,
  timerCount,
  canEdit,
}: {
  eventId: string;
  run: CorrectableRun;
  timerCount: number;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RunStatus>(
    run.status === "scratch" ? "turned_out" : run.status,
  );
  const [penalty, setPenalty] = useState(String(run.penalty));
  const action = correctRun.bind(null, eventId);
  const [state, formAction, pending] = useActionState<LiveRunState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);

  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        aria-label={`Correct result for ${run.name}`}
        title="Correct result"
        className="grid h-8 w-8 place-items-center rounded-md border border-[#d7ddda] bg-white text-[#66716b] hover:bg-[#f4f6f5] disabled:opacity-40"
      >
        <Pencil size={14} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close correction dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="text-lg font-bold">Correct run result</h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  {run.name} · Entry #{run.entryNumber}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>
            <form action={formAction} className="space-y-4 p-5">
              <input type="hidden" name="runId" value={run.id} />
              <input type="hidden" name="penalty" value={penalty} />
              <label className="block text-sm font-semibold">
                Correct outcome
                <select
                  name="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as RunStatus)
                  }
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  {correctionOutcomes.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {runStatusLabels[outcome]}
                    </option>
                  ))}
                </select>
              </label>

              {status === "complete" ? (
                <div>
                  <p className="text-sm font-semibold">Timer readings</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: timerCount }, (_, index) => (
                      <label
                        key={index}
                        className="flex items-center gap-2 rounded-md border border-[#ccd4d0] px-3"
                      >
                        <span className="text-xs font-bold text-[#758078]">
                          T{index + 1}
                        </span>
                        <input
                          name="timerReading"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          defaultValue={run.timerReadings[index] ?? ""}
                          className="h-11 min-w-0 flex-1 bg-transparent text-right font-mono outline-none"
                          placeholder="0.00"
                          required
                        />
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm font-semibold">
                    Penalty seconds
                    <input
                      type="number"
                      min="0"
                      max="999"
                      step="0.01"
                      value={penalty}
                      onChange={(event) => setPenalty(event.target.value)}
                      className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 font-mono"
                    />
                  </label>
                </div>
              ) : null}

              <label className="block text-sm font-semibold">
                Reason for correction
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={300}
                  required
                  className="mt-2 min-h-24 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                  placeholder="What was corrected and why?"
                />
                <span className="mt-1 block text-xs font-normal text-[#758078]">
                  This reason and your user account are saved in the changelog.
                </span>
              </label>

              {state.message ? (
                <p
                  aria-live="polite"
                  className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
                >
                  {state.message}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={pending}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Save correction
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
