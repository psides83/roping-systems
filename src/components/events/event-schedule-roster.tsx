"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  addRopingToEvent,
  removeRopingFromEvent,
  type EventScheduleFormState,
} from "@/app/(app)/events/[eventId]/actions";
import type { CompetitionFormat } from "@/types/domain";

export interface AddRopingTemplate {
  id: string;
  name: string;
  divisionName: string;
  disciplineId: string;
  availableDivisionIds?: string[];
  handicapClassificationIds?: string[];
  divisionNames?: Record<string, string>;
  competitionFormat: CompetitionFormat;
}

export interface AddRopingClassification {
  id: string;
  name: string;
  disciplineId: string;
  standaloneEnabled: boolean;
}

export function AddEventRopingDialog({
  eventId,
  templates,
  classifications,
  defaultDate,
  finalDate,
  arenaCount,
  existingRopings,
  enabled,
}: {
  eventId: string;
  templates: AddRopingTemplate[];
  classifications: AddRopingClassification[];
  defaultDate: string;
  finalDate: string;
  arenaCount: number;
  existingRopings: Array<{
    name: string;
    scheduledDate: string;
    arenaName: string | null;
  }>;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [classificationId, setClassificationId] = useState("");
  const [chosenDivision, setChosenDivision] = useState("");
  const [scheduleType, setScheduleType] = useState("fixed");
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [arenaName, setArenaName] = useState("Arena 1");
  const template = templates.find((item) => item.id === templateId);
  const divisionIds = template?.availableDivisionIds ?? (template ? [template.disciplineId] : []);
  const selectedDivision = divisionIds.includes(chosenDivision) ? chosenDivision : divisionIds[0];
  const eligible = classifications.filter(
    (item) =>
      item.disciplineId === selectedDivision && (template?.competitionFormat === "handicap" ? template.handicapClassificationIds?.includes(item.id) : item.standaloneEnabled),
  );
  const actionWithId = addRopingToEvent.bind(null, eventId);
  const [state, action, pending] = useActionState<
    EventScheduleFormState,
    FormData
  >(actionWithId, {});
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);
  const selectedClassification = eligible.some((item) => item.id === classificationId)
    ? classificationId
    : eligible[0]?.id ?? "";
  const followedRoping = existingRopings.findLast(
    (item) =>
      item.scheduledDate === scheduledDate && item.arenaName === arenaName,
  );

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
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    setClassificationId("");
                    setChosenDivision("");
                  }}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.divisionName} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {divisionIds.length > 1 ? (
                <label className="text-sm font-semibold">Division
                  <select value={selectedDivision} onChange={(event) => { setChosenDivision(event.target.value); setClassificationId(""); }} className="mt-2 h-11 rounded-md border border-[#ccd4d0] bg-white px-3">
                    {divisionIds.map((id) => <option key={id} value={id}>{template?.divisionNames?.[id] ?? template?.divisionName}</option>)}
                  </select>
                </label>
              ) : null}
              {template?.competitionFormat === "handicap" ? (
                <input type="hidden" name="classificationId" value={selectedClassification} />
              ) : (
                <label className="text-sm font-semibold">
                  Classification
                  <select
                    key={templateId}
                    name="classificationId"
                    value={selectedClassification}
                    onChange={(event) => setClassificationId(event.target.value)}
                    className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                    required
                  >
                    {!eligible.length ? <option value="">No eligible classifications</option> : null}
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
                  min={defaultDate}
                  max={finalDate}
                  value={scheduledDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setScheduledDate(nextDate);
                    if (
                      scheduleType === "follows_previous" &&
                      !existingRopings.some(
                        (item) =>
                          item.scheduledDate === nextDate &&
                          item.arenaName === arenaName,
                      )
                    )
                      setScheduleType("fixed");
                  }}
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
                  <option value="follows_previous" disabled={!followedRoping}>
                    {followedRoping
                      ? `Follows ${followedRoping.name}`
                      : "Follows previous in this arena"}
                  </option>
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
                Arena
                <select
                  name="arenaName"
                  value={arenaName}
                  onChange={(event) => {
                    const nextArena = event.target.value;
                    setArenaName(nextArena);
                    if (
                      scheduleType === "follows_previous" &&
                      !existingRopings.some(
                        (item) =>
                          item.scheduledDate === scheduledDate &&
                          item.arenaName === nextArena,
                      )
                    )
                      setScheduleType("fixed");
                  }}
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  {Array.from({ length: arenaCount }, (_, index) => (
                    <option key={index + 1} value={`Arena ${index + 1}`}>
                      Arena {index + 1}
                    </option>
                  ))}
                  <option value="First Available">First Available</option>
                </select>
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
                    !eligible.length
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
  eventId,
  divisionId,
  name,
  entryCount,
  enabled,
  showLabel = false,
}: {
  eventId: string;
  divisionId: string;
  name: string;
  entryCount: number;
  enabled: boolean;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const actionWithIds = removeRopingFromEvent.bind(null, eventId, divisionId);
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
