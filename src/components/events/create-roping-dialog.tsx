"use client";
import { Dialog } from "@/components/ui/dialog";
import { ContextHelp } from "@/components/help/context-help";
import { NumberStepper } from "@/components/ui/number-stepper";

import { startTransition, useActionState, useEffect, useId, useState } from "react";
import {
  CircleDollarSign,
  Copy,
  LoaderCircle,
  Plus,
} from "lucide-react";
import {
  createRoping,
  type RopingFormState,
} from "@/app/(app)/events/actions";
import {
  ScheduledClassFields,
  type EventTemplate,
  type IncentiveClassification,
  type ScheduledOccurrenceDraft,
} from "@/components/events/scheduled-class-fields";
import { EventQualificationFields } from "@/components/events/event-qualification-fields";

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

function shiftLocalDateTime(value: string, milliseconds: number) {
  if (!value) return "";
  return new Date(Date.parse(`${value}:00Z`) + milliseconds)
    .toISOString()
    .slice(0, 16);
}

export interface RopingDraft {
  sourceTitle: string;
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
  eventFeeTitle: string;
  eventFeeAmount: string;
  occurrences: ScheduledOccurrenceDraft[];
}

export function CreateRopingDialog({
  configured,
  divisions,
  incentiveClassifications,
  initialValues,
}: {
  configured: boolean;
  divisions: EventTemplate[];
  incentiveClassifications: IncentiveClassification[];
  initialValues?: RopingDraft;
}) {
  const slugHintId = useId();
  const isDuplicate = Boolean(initialValues);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [slug, setSlug] = useState(initialValues?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [startsAt, setStartsAt] = useState(initialValues?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(initialValues?.endsAt ?? "");
  const [entriesOpenAt, setEntriesOpenAt] = useState(
    initialValues?.entriesOpenAt ?? "",
  );
  const [entriesCloseAt, setEntriesCloseAt] = useState(
    initialValues?.entriesCloseAt ?? "",
  );
  const [publicationState, setPublicationState] = useState(initialValues?.publicationState ?? "draft");
  const [arenaCount, setArenaCount] = useState(initialValues?.arenaCount ?? 1);
  const [state, action, pending] = useActionState(createRoping, initialState);

  function openForm() {
    setTitle(initialValues?.title ?? "");
    setSlug(initialValues?.slug ?? "");
    setSlugEdited(false);
    setStartsAt(initialValues?.startsAt ?? "");
    setEndsAt(initialValues?.endsAt ?? "");
    setEntriesOpenAt(initialValues?.entriesOpenAt ?? "");
    setEntriesCloseAt(initialValues?.entriesCloseAt ?? "");
    setArenaCount(initialValues?.arenaCount ?? 1);
    setPublicationState(initialValues?.publicationState ?? "draft");
    setFormKey((current) => current + 1);
    setOpen(true);
  }

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        className={
          isDuplicate
            ? "flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-sm font-semibold hover:bg-[#f7f8f7]"
            : "flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
        }
      >
        {isDuplicate ? <Copy size={16} /> : <Plus size={17} />}
        {isDuplicate ? "Duplicate event" : "Create event"}
      </button>
      {open ? (
        <Dialog wide title={isDuplicate ? "Duplicate event" : "Create event"}
          description={isDuplicate ? `Review the copied setup from ${initialValues?.sourceTitle} before creating the new event.` : "Set the date and location, add your ropings, then choose who can see the event."}
          busy={pending} onClose={() => setOpen(false)}>
            <form key={formKey} onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              const data = new FormData(event.currentTarget);
              startTransition(() => action(data));
            }} className="space-y-6 p-5">
              {isDuplicate ? (
                <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900">
                  The event setup is copied for review. Entries, payments,
                  draws, recorded times, results, and payouts from the original
                  event are not copied.
                </p>
              ) : null}
              <section className="space-y-3">
                <ContextHelp title="What am I creating?" guide="schedule-event"><p>An event is the full day or weekend. Each competition on its schedule is a roping copied from a reusable template. Saving an event, publishing it, and opening online entries are separate choices.</p></ContextHelp>
                <h3 className="text-base font-bold">1. Event details</h3>
                <p className="mt-1 text-sm text-[#66716b]">
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
                    Public page address
                    <input
                      name="slug"
                      value={slug}
                      onChange={(event) => {
                        setSlugEdited(true);
                        setSlug(toSlug(event.target.value));
                      }}
                      className={inputClass}
                      placeholder="fall-classic-weekend"
                      aria-describedby={slugHintId}
                      required
                    />
                  </label>
                  <p id={slugHintId} className="text-sm text-[#66716b] sm:col-span-2">The public page address is filled from the title. You can adjust it before creating the event.</p>
                  <label className="block text-sm font-semibold">
                    Event starts
                    <input
                      name="startsAt"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(event) => {
                        const nextStartsAt = event.target.value;
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
                  </label>
                  <label className="block text-sm font-semibold">
                    Event ends
                    <input
                      name="endsAt"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(event) => setEndsAt(event.target.value)}
                      className={inputClass}
                    />
                    {state.errors?.endsAt ? (
                      <span className="mt-1 block text-xs text-rose-700">
                        {state.errors.endsAt[0]}
                      </span>
                    ) : null}
                  </label>
                  <div className="block text-sm font-semibold">
                    Number of arenas
                    <NumberStepper label="Number of arenas"
                      name="arenaCount"
                      min="1"
                      max="20"
                      value={arenaCount}
                      onChange={(event) =>
                        setArenaCount(Number(event.target.value))
                      }
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-[#dfe4e1] p-4">
                <h3 className="text-base font-bold">2. Location</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold sm:col-span-2">
                    Venue
                    <input
                      name="venueName"
                      defaultValue={initialValues?.venueName}
                      className={inputClass}
                      placeholder="Circle T Arena"
                    />
                  </label>
                  <label className="block text-sm font-semibold sm:col-span-2">
                    Street address
                    <input
                      name="address"
                      defaultValue={initialValues?.address}
                      className={inputClass}
                      placeholder="4007 W Highway 36"
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    City
                    <input
                      name="city"
                      defaultValue={initialValues?.city}
                      className={inputClass}
                      placeholder="Hamilton"
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <label className="block text-sm font-semibold">
                      State
                      <input
                        name="state"
                        defaultValue={initialValues?.state}
                        className={inputClass}
                        placeholder="TX"
                      />
                    </label>
                    <label className="block text-sm font-semibold">
                      ZIP
                      <input
                        name="postalCode"
                        defaultValue={initialValues?.postalCode}
                        className={inputClass}
                        inputMode="numeric"
                        placeholder="76531"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
              <ScheduledClassFields
                heading="3. Roping schedule"
                description="Add a template for each competition, then arrange the running order. A template can be used more than once. Its settings are copied into this event for you to review."
                templates={divisions}
                classifications={incentiveClassifications}
                eventStartDate={startsAt.slice(0, 10)}
                eventEndDate={(endsAt || startsAt).slice(0, 10)}
                arenaCount={arenaCount}
                initialOccurrences={initialValues?.occurrences}
                error={state.errors?.classOccurrences?.[0]}
              />

              </section>

              {!divisions.length ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Create at least one roping template before scheduling a
                  roping.
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
                      4. Event charge (optional)
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#66716b]">
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
                      defaultValue={initialValues?.eventFeeTitle}
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
                        defaultValue={initialValues?.eventFeeAmount}
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

              <EventQualificationFields />
              <section className="space-y-4 rounded-md border border-[#dfe4e1] p-4">
                <div><h3 className="text-base font-bold">5. Visibility & online entries</h3><p className="mt-1 text-sm leading-6 text-[#66716b]">Publishing makes the event visible to the public. The entry dates below control when online entries are accepted.</p></div>
              <label className="block text-sm font-semibold">
                Public visibility
                <select
                  name="publicationState"
                  value={publicationState}
                  onChange={(event) => setPublicationState(event.target.value as RopingDraft["publicationState"])}
                  className={inputClass}
                >
                  <option value="draft">Draft — hidden from the public</option>
                  <option value="published">Published — visible to the public</option>
                  <option value="unpublished">Unpublished — hidden from the public</option>
                </select>
              </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">
                    Entries open
                    <input
                      name="entriesOpenAt"
                      type="datetime-local"
                      value={entriesOpenAt}
                      onChange={(event) => setEntriesOpenAt(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Entries close
                    <input
                      name="entriesCloseAt"
                      type="datetime-local"
                      value={entriesCloseAt}
                      onChange={(event) =>
                        setEntriesCloseAt(event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <p className="text-sm leading-6 text-[#66716b]">Entry dates are optional. You can review visibility and entry settings after creating the event.</p>
              </section>
              <div className="rounded-md bg-[#f4f6f5] p-4 text-sm leading-6">
                <p className="font-bold">{publicationState === "published" ? "This event will be visible to the public." : "This event will stay hidden from the public."}</p>
                <p className="text-[#526059]">{publicationState === "published" ? "Review the schedule and entry dates before creating it." : "Create it now, review the schedule, and publish when you are ready."}</p>
              </div>

              {state.message ? (
                <p role={state.success ? "status" : "alert"}
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
                  data-dialog-close
                  disabled={pending}
                  className="h-11 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={pending || !configured || !divisions.length}
                  className="flex min-h-11 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  {isDuplicate ? "Create duplicate" : "Create event"}
                </button>
              </div>
            </form>
        </Dialog>
      ) : null}
    </>
  );
}
