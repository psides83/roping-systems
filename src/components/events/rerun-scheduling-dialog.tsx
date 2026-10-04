"use client";

import { LoaderCircle, RotateCcw, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  scheduleRerun,
  type LiveRunState,
} from "@/app/(app)/events/[eventId]/actions";
import { cn } from "@/lib/utils";

type RerunTiming = "immediate" | "end_of_round";

interface RerunRun {
  id: string;
  name: string;
  entryNumber: number;
}

const timingOptions: Array<{
  value: RerunTiming;
  title: string;
  description: string;
}> = [
  {
    value: "immediate",
    title: "Next available",
    description: "Returns this contestant to the box next.",
  },
  {
    value: "end_of_round",
    title: "End of round",
    description: "Moves this contestant behind the remaining draw.",
  },
];

export function RerunSchedulingDialog({
  eventId,
  run,
  canEdit,
}: {
  eventId: string;
  run: RerunRun;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [timing, setTiming] = useState<RerunTiming>("immediate");
  const action = scheduleRerun.bind(null, eventId);
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
        className="flex h-8 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
      >
        <RotateCcw size={14} /> Schedule rerun
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close rerun dialog"
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
                <h2 className="text-lg font-bold">Schedule rerun</h2>
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
            <form action={formAction} className="space-y-5 p-5">
              <input type="hidden" name="runId" value={run.id} />
              <fieldset>
                <legend className="text-sm font-semibold">When to rerun</legend>
                <div className="mt-2 divide-y divide-[#e1e6e3] rounded-md border border-[#ccd4d0]">
                  {timingOptions.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 p-4",
                        timing === option.value && "bg-[#fff6f2]",
                      )}
                    >
                      <input
                        type="radio"
                        name="timing"
                        value={option.value}
                        checked={timing === option.value}
                        onChange={() => setTiming(option.value)}
                        className="mt-1 accent-[var(--brand-accent)]"
                      />
                      <span>
                        <span className="block text-sm font-bold">
                          {option.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#66716b]">
                          {option.description} Later-round positions do not
                          change.
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-sm font-semibold">
                Reason for rerun
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={300}
                  required
                  className="mt-2 min-h-24 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                  placeholder="Why was this rerun awarded?"
                />
                <span className="mt-1 block text-xs font-normal text-[#758078]">
                  The reason, timing choice, and your account are saved in the
                  changelog.
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
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  Schedule rerun
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
