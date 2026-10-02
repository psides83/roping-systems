"use client";

import { useActionState, useEffect, useState } from "react";
import { ClockAlert, LoaderCircle, X } from "lucide-react";
import {
  updateClassEventDayStatus,
  type EventDayFormState,
} from "@/app/(app)/ropings/[ropingId]/actions";

export type ClassEventDayStatus =
  | "scheduled"
  | "delayed"
  | "holding"
  | "in_progress"
  | "completed";

export const classEventDayStatusLabels: Record<ClassEventDayStatus, string> = {
  scheduled: "Scheduled",
  delayed: "Delayed",
  holding: "Holding",
  in_progress: "In progress",
  completed: "Completed",
};

export function ClassOperationsDialog({
  ropingId,
  divisionId,
  className,
  arenaName,
  status,
  estimatedStart,
  note,
  editable,
  compact = false,
}: {
  ropingId: string;
  divisionId: string;
  className: string;
  arenaName: string | null;
  status: ClassEventDayStatus;
  estimatedStart: string;
  note: string | null;
  editable: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = updateClassEventDayStatus.bind(null, ropingId, divisionId);
  const [state, formAction, pending] = useActionState<
    EventDayFormState,
    FormData
  >(action, {});

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!editable}
        className={`flex items-center justify-center gap-2 rounded-md border border-[#d7ddda] font-semibold disabled:opacity-50 ${compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm"}`}
      >
        <ClockAlert size={15} /> Update live schedule
      </button>
      {open ? (
        <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`class-operations-${divisionId}`}
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`class-operations-${divisionId}`} className="font-bold">
                  Update live schedule
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">{className}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>
            <form action={formAction} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  Current arena
                  <input
                    name="arenaName"
                    defaultValue={arenaName ?? ""}
                    maxLength={80}
                    placeholder="Arena 1"
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Status
                  <select
                    name="eventDayStatus"
                    defaultValue={status}
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                  >
                    {Object.entries(classEventDayStatusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-semibold">
                Updated expected start
                <input
                  name="estimatedStart"
                  type="datetime-local"
                  defaultValue={estimatedStart}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                />
                <span className="mt-1 block text-xs font-normal text-[#758078]">
                  Leave blank when the time is unknown or still follows the
                  previous roping.
                </span>
              </label>
              <label className="block text-sm font-semibold">
                Public update
                <textarea
                  name="eventDayNote"
                  defaultValue={note ?? ""}
                  maxLength={180}
                  rows={3}
                  placeholder="Arena drag in progress"
                  className="mt-2 w-full resize-y rounded-md border border-[#ccd4d0] px-3 py-2"
                />
              </label>
              {state.message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                  aria-live="polite"
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
                  Publish update
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
