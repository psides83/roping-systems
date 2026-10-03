"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  addRopingToEvent,
  removeRopingFromEvent,
  type EventScheduleFormState,
} from "@/app/(app)/ropings/[ropingId]/actions";
import type { CompetitionFormat } from "@/types/domain";

export interface AddRopingTemplate {
  id: string;
  name: string;
  divisionName: string;
  disciplineId: string;
  competitionFormat: CompetitionFormat;
}

export interface AddRopingClassification {
  id: string;
  name: string;
  disciplineId: string;
}

export function AddEventRopingDialog({
  ropingId,
  templates,
  classifications,
  defaultDate,
  enabled,
}: {
  ropingId: string;
  templates: AddRopingTemplate[];
  classifications: AddRopingClassification[];
  defaultDate: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [scheduleType, setScheduleType] = useState("fixed");
  const template = templates.find((item) => item.id === templateId);
  const eligible = classifications.filter(
    (item) => item.disciplineId === template?.disciplineId,
  );
  const actionWithId = addRopingToEvent.bind(null, ropingId);
  const [state, action, pending] = useActionState<
    EventScheduleFormState,
    FormData
  >(actionWithId, {});
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);
  const firstClassification = useMemo(() => eligible[0]?.id ?? "", [eligible]);

  return (
    <>
      <button
        type="button"
        disabled={!enabled || !templates.length}
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
      >
        <Plus size={15} /> Add roping
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative my-8 w-full max-w-xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="font-bold">Add roping to event</h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  The template’s fees, payout setup, timing, and handicap rules
                  will be copied.
                </p>
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
            <form action={action} className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">
                Roping template
                <select
                  name="templateId"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.divisionName} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {template?.competitionFormat === "handicap" ? (
                <input type="hidden" name="classificationId" value="" />
              ) : (
                <label className="text-sm font-semibold">
                  Classification
                  <select
                    key={templateId}
                    name="classificationId"
                    defaultValue={firstClassification}
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                    required
                  >
                    {eligible.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm font-semibold">
                Date
                <input
                  name="scheduledDate"
                  type="date"
                  defaultValue={defaultDate}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  required
                />
              </label>
              <label className="text-sm font-semibold">
                Start listing
                <select
                  name="scheduleType"
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  <option value="fixed">Set time</option>
                  <option value="tentative">Tentative time</option>
                  <option value="follows_previous">Follows previous</option>
                </select>
              </label>
              {scheduleType !== "follows_previous" ? (
                <label className="text-sm font-semibold">
                  Start time
                  <input
                    name="startTime"
                    type="time"
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                    required
                  />
                </label>
              ) : (
                <input type="hidden" name="startTime" value="" />
              )}
              <label className="text-sm font-semibold">
                Main rounds
                <input
                  name="roundCount"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue="1"
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  required
                />
              </label>
              <label className="text-sm font-semibold">
                Arena{" "}
                <span className="font-normal text-[#758078]">(optional)</span>
                <input
                  name="arenaName"
                  maxLength={80}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Schedule note{" "}
                <span className="font-normal text-[#758078]">(optional)</span>
                <input
                  name="scheduleNote"
                  maxLength={120}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
                <input
                  name="cattleDrawEnabled"
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Draw and track cattle
              </label>
              {state.message && !state.success ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2">
                  {state.message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={
                    pending ||
                    (!eligible.length &&
                      template?.competitionFormat !== "handicap")
                  }
                  className="h-10 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? "Adding..." : "Add roping"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function RemoveEventRopingDialog({
  ropingId,
  divisionId,
  name,
  entryCount,
  enabled,
  showLabel = false,
}: {
  ropingId: string;
  divisionId: string;
  name: string;
  entryCount: number;
  enabled: boolean;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const actionWithIds = removeRopingFromEvent.bind(null, ropingId, divisionId);
  const [state, action, pending] = useActionState<
    EventScheduleFormState,
    FormData
  >(actionWithIds, {});
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);
  return (
    <>
      <button
        type="button"
        disabled={!enabled}
        title={
          enabled
            ? "Remove roping"
            : "A roping cannot be removed after it starts"
        }
        onClick={() => setOpen(true)}
        className={`h-9 rounded-md border border-rose-200 text-rose-700 disabled:opacity-35 ${showLabel ? "flex items-center gap-2 px-3 text-xs font-semibold" : "grid w-9 place-items-center"}`}
      >
        <Trash2 size={15} />
        {showLabel ? "Remove roping" : null}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-md bg-white p-5 shadow-2xl"
          >
            <h2 className="font-bold">Remove {name}?</h2>
            <p className="mt-2 text-sm leading-6 text-[#66716b]">
              This removes the roping, its {entryCount}{" "}
              {entryCount === 1 ? "entry" : "entries"}, fees, draws, and pending
              runs from the event. The removal remains in the changelog.
            </p>
            <form action={action} className="mt-4">
              <label className="text-sm font-semibold">
                Reason
                <input
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3"
                  placeholder="Roping cancelled by producer"
                />
              </label>
              {state.message && !state.success ? (
                <p className="mt-3 text-sm text-rose-700">{state.message}</p>
              ) : null}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  disabled={pending}
                  className="h-10 rounded-md bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? "Removing..." : "Remove roping"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
