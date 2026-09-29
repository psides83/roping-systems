"use client";

import { useActionState, useEffect, useState } from "react";
import {
  CalendarPlus,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  createRoping,
  type RopingFormState,
} from "@/app/(app)/ropings/actions";
import {
  ScheduledClassFields,
  type EventTemplate,
  type IncentiveClassification,
} from "@/components/ropings/scheduled-class-fields";
import { ShortRoundFields } from "@/components/ropings/short-round-settings";

const initialState: RopingFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateRopingDialog({
  configured,
  divisions,
  incentiveClassifications,
}: {
  configured: boolean;
  divisions: EventTemplate[];
  incentiveClassifications: IncentiveClassification[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [state, action, pending] = useActionState(createRoping, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
      >
        <Plus size={17} /> Create roping
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative my-8 w-full max-w-4xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CalendarPlus
                    size={19}
                    className="text-[var(--brand-accent-strong)]"
                  />
                  Create roping event
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Schedule the weekend, then add each actual roping in running
                  order.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>

            <form action={action} className="space-y-6 p-5">
              <section>
                <h3 className="text-sm font-bold">Event details</h3>
                <p className="mt-1 text-xs text-[#758078]">
                  The event is the full day or weekend containing the scheduled
                  ropings below.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">
                    Event title
                    <input
                      name="title"
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        if (!slugEdited) setSlug(toSlug(event.target.value));
                      }}
                      className={inputClass}
                      placeholder="Fall Classic Weekend"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Public URL
                    <input
                      name="slug"
                      value={slug}
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlug(toSlug(event.target.value));
                      }}
                      className={inputClass}
                      placeholder="fall-classic-weekend"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Venue
                    <input
                      name="venueName"
                      className={inputClass}
                      placeholder="Red River Arena"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Address
                    <input
                      name="address"
                      className={inputClass}
                      placeholder="Wichita Falls, TX"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Event starts
                    <input
                      name="startsAt"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(event) => setStartsAt(event.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Event ends
                    <input
                      name="endsAt"
                      type="datetime-local"
                      className={inputClass}
                    />
                    {state.errors?.endsAt ? (
                      <span className="mt-1 block text-xs text-rose-700">
                        {state.errors.endsAt[0]}
                      </span>
                    ) : null}
                  </label>
                  <label className="block text-sm font-semibold">
                    Entries open
                    <input
                      name="entriesOpenAt"
                      type="datetime-local"
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Entries close
                    <input
                      name="entriesCloseAt"
                      type="datetime-local"
                      className={inputClass}
                    />
                  </label>
                </div>
              </section>

              <ScheduledClassFields
                templates={divisions}
                classifications={incentiveClassifications}
                eventStartDate={startsAt.slice(0, 10)}
                error={state.errors?.classOccurrences?.[0]}
              />

              {!divisions.length ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Create at least one event template before scheduling a roping.
                </p>
              ) : null}

              <ShortRoundFields />
              {state.errors?.shortRoundBrackets ? (
                <p className="text-xs text-rose-700">
                  {state.errors.shortRoundBrackets[0]}
                </p>
              ) : null}

              <section className="rounded-md border border-[#dfe4e1] p-4">
                <div className="flex items-start gap-3">
                  <CircleDollarSign
                    size={18}
                    className="mt-0.5 text-[var(--brand-accent-strong)]"
                  />
                  <div>
                    <h3 className="text-sm font-bold">
                      Once-per-contestant event charge
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-[#758078]">
                      Charged once across the entire event, even when a roper
                      enters multiple ropings or days.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    Charge name
                    <input
                      name="eventFeeTitle"
                      className={inputClass}
                      placeholder="Office charge"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Amount
                    <span className="mt-2 flex h-11 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                      <span className="text-[#758078]">$</span>
                      <input
                        name="eventFeeAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        className="min-w-0 flex-1 bg-transparent pl-2 outline-none"
                        placeholder="20.00"
                      />
                    </span>
                  </label>
                </div>
                {state.errors?.eventFeeAmount ? (
                  <p className="mt-2 text-xs text-rose-700">
                    {state.errors.eventFeeAmount[0]}
                  </p>
                ) : null}
              </section>

              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="isPublic"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />
                Publish this event on the organization schedule
              </label>

              {state.message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                >
                  {state.message}
                </p>
              ) : null}
              {!configured ? (
                <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                  Connect Supabase to save events.
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
                  disabled={pending || !configured || !divisions.length}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Create event
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
