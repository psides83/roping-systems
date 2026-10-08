"use client";
import { NumberStepper } from "@/components/ui/number-stepper";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, Pencil, X } from "lucide-react";
import {
  updateEventDetails,
  type EventDetailsFormState,
} from "@/app/(app)/events/[eventId]/actions";
import { QualificationAssignmentDialog } from "@/components/events/qualification-assignment-dialog";

export interface EditableEventDetails {
  id: string;
  title: string;
  slug: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  arenaCount: number;
  startsAt: string;
  endsAt: string;
  entriesOpenAt: string;
  entriesCloseAt: string;
  publicationState: "draft" | "published" | "unpublished";
  eventFee: {
    id: string;
    title: string;
    amount: string;
  } | null;
}

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

function shiftLocalDateTime(value: string, milliseconds: number) {
  if (!value) return "";
  return new Date(Date.parse(`${value}:00Z`) + milliseconds)
    .toISOString()
    .slice(0, 16);
}

export function EventDetailsDialog({
  event,
  editable,
}: {
  event: EditableEventDetails;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(event.startsAt);
  const [endsAt, setEndsAt] = useState(event.endsAt);
  const [entriesOpenAt, setEntriesOpenAt] = useState(event.entriesOpenAt);
  const [entriesCloseAt, setEntriesCloseAt] = useState(event.entriesCloseAt);
  const action = updateEventDetails.bind(null, event.id);
  const [state, formAction, pending] = useActionState<
    EventDetailsFormState,
    FormData
  >(action, {});

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.success]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        data-close-mobile-menu
        type="button"
        onClick={() => setOpen(true)}
        disabled={!editable}
        title={
          editable
            ? "Edit event details"
            : "Event details lock when the event starts"
        }
        className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold disabled:opacity-45 [&>svg]:shrink-0"
      >
        <Pencil size={15} /> Edit event
      </button>
      {open ? createPortal(
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
            className="relative my-8 w-full max-w-3xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="font-bold">Edit event</h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Update the event listing and online entry window.
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
            <form action={formAction} className="space-y-5 p-5">
              <input
                type="hidden"
                name="eventFeeId"
                value={event.eventFee?.id ?? ""}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Event title" error={state.errors?.title?.[0]}>
                  <input
                    name="title"
                    defaultValue={event.title}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Public URL" error={state.errors?.slug?.[0]}>
                  <input
                    name="slug"
                    defaultValue={event.slug}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Event starts">
                  <input
                    name="startsAt"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(changeEvent) => {
                      const nextStartsAt = changeEvent.target.value;
                      if (startsAt && nextStartsAt) {
                        const difference =
                          Date.parse(`${nextStartsAt}:00Z`) -
                          Date.parse(`${startsAt}:00Z`);
                        setEndsAt((current) =>
                          shiftLocalDateTime(current, difference),
                        );
                        setEntriesOpenAt((current) =>
                          shiftLocalDateTime(current, difference),
                        );
                        setEntriesCloseAt((current) =>
                          shiftLocalDateTime(current, difference),
                        );
                      }
                      setStartsAt(nextStartsAt);
                    }}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Event ends" error={state.errors?.endsAt?.[0]}>
                  <input
                    name="endsAt"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(changeEvent) =>
                      setEndsAt(changeEvent.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Entries open">
                  <input
                    name="entriesOpenAt"
                    type="datetime-local"
                    value={entriesOpenAt}
                    onChange={(changeEvent) =>
                      setEntriesOpenAt(changeEvent.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Entries close"
                  error={state.errors?.entriesCloseAt?.[0]}
                >
                  <input
                    name="entriesCloseAt"
                    type="datetime-local"
                    value={entriesCloseAt}
                    onChange={(changeEvent) =>
                      setEntriesCloseAt(changeEvent.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>

              <section className="rounded-md border border-[#dfe4e1] p-4">
                <h3 className="text-sm font-bold">Event location</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Venue">
                    <input
                      name="venueName"
                      defaultValue={event.venueName}
                      className={inputClass}
                      placeholder="Circle T Arena"
                    />
                  </Field>
                  <Field label="Street address">
                    <input
                      name="address"
                      defaultValue={event.address}
                      className={inputClass}
                      placeholder="4007 W Highway 36"
                    />
                  </Field>
                  <Field label="City">
                    <input
                      name="city"
                      defaultValue={event.city}
                      className={inputClass}
                      placeholder="Hamilton"
                    />
                  </Field>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <Field label="State">
                      <input
                        name="state"
                        defaultValue={event.state}
                        className={inputClass}
                        placeholder="TX"
                      />
                    </Field>
                    <Field label="ZIP">
                      <input
                        name="postalCode"
                        defaultValue={event.postalCode}
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="76531"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-[#dfe4e1] p-4">
                <h3 className="text-sm font-bold">Arena setup</h3>
                <p className="mt-1 text-xs leading-5 text-[#758078]">
                  Ropings can use a numbered arena or the first available arena.
                </p>
                <div className="mt-3 max-w-48">
                  <Field
                    label="Number of arenas"
                    error={state.errors?.arenaCount?.[0]}
                  >
                    <NumberStepper label="Number of arenas"
                      name="arenaCount"
                      min="1"
                      max="20"
                      defaultValue={event.arenaCount}
                      className={inputClass}
                      required
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-md border border-[#dfe4e1] p-4">
                <h3 className="text-sm font-bold">
                  Once-per-contestant event charge
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#758078]">
                  Leave both fields blank when this event has no weekend or
                  office charge.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Charge name">
                    <input
                      name="eventFeeTitle"
                      defaultValue={event.eventFee?.title ?? ""}
                      className={inputClass}
                      placeholder="Office charge"
                    />
                  </Field>
                  <Field
                    label="Amount"
                    error={state.errors?.eventFeeAmount?.[0]}
                  >
                    <span className="mt-2 flex h-11 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                      <span className="text-[#758078]">$</span>
                      <input
                        name="eventFeeAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={event.eventFee?.amount ?? ""}
                        className="min-w-0 flex-1 bg-transparent pl-2 outline-none"
                        placeholder="20.00"
                      />
                    </span>
                  </Field>
                </div>
              </section>

              <section className="border-y border-[#dfe4e1] py-4"><QualificationAssignmentDialog eventId={event.id} editable={editable} /></section>
              <label className="block text-sm font-semibold">
                Publication state
                <select
                  name="publicationState"
                  defaultValue={event.publicationState}
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="unpublished">Unpublished</option>
                </select>
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
                  Save changes
                </button>
              </div>
            </form>
          </section>
        </div>, document.body
      ) : null}
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-700">{error}</span>
      ) : null}
    </label>
  );
}
