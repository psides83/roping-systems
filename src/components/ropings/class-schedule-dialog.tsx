"use client";

import { useActionState, useEffect, useState } from "react";
import { Clock3, LoaderCircle, X } from "lucide-react";
import {
  updateClassSchedule,
  type ScheduleFormState,
} from "@/app/(app)/ropings/[ropingId]/actions";

const initialState: ScheduleFormState = {};

export function ClassScheduleDialog({
  ropingId,
  divisionId,
  name,
  scheduledDate,
  scheduleType,
  startTime,
  scheduleNote,
  followsRopingName,
  editable,
}: {
  ropingId: string;
  divisionId: string;
  name: string;
  scheduledDate: string;
  scheduleType: "fixed" | "tentative" | "follows_previous";
  startTime: string;
  scheduleNote: string | null;
  followsRopingName: string | null;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(scheduleType);
  const action = updateClassSchedule.bind(null, ropingId, divisionId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!editable}
        className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold disabled:opacity-50"
      >
        <Clock3 size={15} /> Edit schedule
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="font-bold">Edit roping schedule</h2>
                <p className="mt-1 text-sm text-[#66716b]">{name}</p>
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
                  Date
                  <input
                    name="scheduledDate"
                    type="date"
                    defaultValue={scheduledDate}
                    required
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Start listing
                  <select
                    name="scheduleType"
                    value={type}
                    onChange={(event) =>
                      setType(
                        event.target.value as
                          | "fixed"
                          | "tentative"
                          | "follows_previous",
                      )
                    }
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                  >
                    <option value="fixed">Set time</option>
                    <option value="tentative">Tentative time</option>
                    <option value="follows_previous">
                      {followsRopingName
                        ? `Follows ${followsRopingName}`
                        : "Follows previous in this arena"}
                    </option>
                  </select>
                </label>
              </div>
              {type !== "follows_previous" ? (
                <label className="block text-sm font-semibold">
                  {type === "tentative" ? "Tentative time" : "Start time"}
                  <input
                    name="startTime"
                    type="time"
                    defaultValue={startTime}
                    required
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  />
                </label>
              ) : (
                <input type="hidden" name="startTime" value="" />
              )}
              <label className="block text-sm font-semibold">
                Schedule note
                <input
                  name="scheduleNote"
                  defaultValue={scheduleNote ?? ""}
                  maxLength={120}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  placeholder="Arena drag before this roping"
                />
              </label>
              {state.message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
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
                  Save schedule
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
