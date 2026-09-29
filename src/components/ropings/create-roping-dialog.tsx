"use client";

import { useActionState, useEffect, useState } from "react";
import {
  CalendarPlus,
  CircleDollarSign,
  Gauge,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import {
  createRoping,
  type RopingFormState,
} from "@/app/(app)/ropings/actions";
import { ShortRoundFields } from "@/components/ropings/short-round-settings";
import { formatCurrency } from "@/lib/utils";

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

interface IncentiveClassification {
  id: string;
  disciplineId: string;
  divisionName: string;
  name: string;
}

interface EventTemplate {
  id: string;
  name: string;
  disciplineId: string | null;
  divisionName: string;
  fees: Array<{
    id: string;
    title: string;
    amountCents: number;
    isRequired: boolean;
  }>;
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
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [roundCounts, setRoundCounts] = useState<Record<string, string>>({});
  const [incentiveClasses, setIncentiveClasses] = useState<
    Record<string, boolean>
  >({});
  const [allRounds, setAllRounds] = useState("1");
  const [state, action, pending] = useActionState(createRoping, initialState);

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  function toggleDivision(divisionId: string, checked: boolean) {
    setSelectedDivisionIds((current) =>
      checked
        ? [...current, divisionId]
        : current.filter((id) => id !== divisionId),
    );
    if (checked)
      setRoundCounts((current) => ({
        ...current,
        [divisionId]: current[divisionId] ?? "1",
      }));
  }

  function applyRoundsToSelected() {
    setRoundCounts((current) => ({
      ...current,
      ...Object.fromEntries(selectedDivisionIds.map((id) => [id, allRounds])),
    }));
  }

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
            className="relative my-8 w-full max-w-3xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CalendarPlus
                    size={19}
                    className="text-[var(--brand-accent-strong)]"
                  />{" "}
                  Create roping event
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Schedule the weekend, then configure each class roping.
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
                  An event can span one day or a full weekend and contain many
                  class ropings.
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

              <fieldset>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <legend className="text-sm font-bold">Class ropings</legend>
                    <p className="mt-1 text-xs text-[#758078]">
                      Each template becomes a separate roping within this event.
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="text-xs font-semibold text-[#66716b]">
                      Main rounds for selected
                      <input
                        value={allRounds}
                        onChange={(event) => setAllRounds(event.target.value)}
                        type="number"
                        min="1"
                        max="20"
                        className="mt-1 block h-9 w-20 rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyRoundsToSelected}
                      disabled={!selectedDivisionIds.length}
                      className="h-9 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      Apply to selected
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-3">
                  {divisions.map((division) => {
                    const selected = selectedDivisionIds.includes(division.id);
                    const eligible = incentiveClassifications.filter(
                      (item) => item.disciplineId === division.disciplineId,
                    );
                    return (
                      <div
                        key={division.id}
                        className="rounded-md border border-[#e1e6e3] bg-white"
                      >
                        <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_72px] items-center gap-3 p-4 text-sm font-semibold">
                          <input
                            name="divisionIds"
                            value={division.id}
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              toggleDivision(division.id, event.target.checked)
                            }
                            className="h-4 w-4 accent-[var(--brand-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {division.name}
                            </span>
                            <span className="block text-xs font-normal text-[#758078]">
                              {division.divisionName}
                            </span>
                          </span>
                          <span className="text-xs font-semibold text-[#66716b]">
                            Main rounds
                            <input
                              name={`roundCount-${division.id}`}
                              value={roundCounts[division.id] ?? "1"}
                              onChange={(event) =>
                                setRoundCounts((current) => ({
                                  ...current,
                                  [division.id]: event.target.value,
                                }))
                              }
                              type="number"
                              min="1"
                              max="20"
                              disabled={!selected}
                              className="mt-1 h-9 w-full rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm disabled:bg-[#f1f3f2]"
                            />
                          </span>
                        </label>
                        {selected ? (
                          <div className="space-y-4 border-t border-[#e7ebe8] bg-[#fafbfa] p-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="text-xs font-semibold text-[#66716b]">
                                Class start time
                                <input
                                  name={`classStartsAt-${division.id}`}
                                  type="datetime-local"
                                  className={inputClass}
                                />
                              </label>
                              <div>
                                <p className="text-xs font-semibold text-[#66716b]">
                                  Entry fees and options
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {division.fees.map((fee) => (
                                    <span
                                      key={fee.id}
                                      className="rounded-md border border-[#dfe4e1] bg-white px-2 py-1 text-xs"
                                    >
                                      {fee.title}{" "}
                                      {formatCurrency(fee.amountCents)} ·{" "}
                                      {fee.isRequired ? "required" : "optional"}
                                    </span>
                                  ))}
                                  {!division.fees.length ? (
                                    <span className="text-xs text-[#8a938e]">
                                      No fees configured
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <label className="flex cursor-pointer items-start gap-3">
                              <input
                                name={`incentiveEnabled-${division.id}`}
                                type="checkbox"
                                checked={incentiveClasses[division.id] ?? false}
                                onChange={(event) =>
                                  setIncentiveClasses((current) => ({
                                    ...current,
                                    [division.id]: event.target.checked,
                                  }))
                                }
                                className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
                              />
                              <Gauge
                                size={17}
                                className="text-[var(--brand-accent-strong)]"
                              />
                              <span>
                                <span className="block text-sm font-bold">
                                  Incentive or handicap class
                                </span>
                                <span className="mt-1 block text-xs text-[#758078]">
                                  Apply classification-based time deductions
                                  only in this class.
                                </span>
                              </span>
                            </label>
                            {incentiveClasses[division.id] ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {eligible.map((classification) => (
                                  <label
                                    key={classification.id}
                                    className="flex items-center gap-3 rounded-md border border-[#e1e6e3] bg-white px-3 py-2"
                                  >
                                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                      {classification.name}
                                    </span>
                                    <span className="flex w-28 items-center rounded-md border border-[#ccd4d0] px-2">
                                      <input
                                        name={`incentiveAdjustment-${division.id}-${classification.id}`}
                                        type="number"
                                        min="0"
                                        max="60"
                                        step="0.001"
                                        className="h-9 min-w-0 flex-1 bg-transparent text-right font-mono text-sm outline-none"
                                        placeholder="0.000"
                                      />
                                      <span className="ml-1 text-xs text-[#758078]">
                                        sec
                                      </span>
                                    </span>
                                  </label>
                                ))}
                                {!eligible.length ? (
                                  <p className="text-sm text-amber-800">
                                    Add classifications for this division before
                                    using incentive handicaps.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {state.errors?.divisionIds ? (
                  <p className="mt-2 text-xs text-rose-700">
                    {state.errors.divisionIds[0]}
                  </p>
                ) : null}
                {state.errors?.roundCounts ? (
                  <p className="mt-2 text-xs text-rose-700">
                    {state.errors.roundCounts[0]}
                  </p>
                ) : null}
                {state.errors?.incentiveRules ? (
                  <p className="mt-2 text-xs text-rose-700">
                    {state.errors.incentiveRules[0]}
                  </p>
                ) : null}
                {!divisions.length ? (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Create at least one event template before scheduling a
                    roping.
                  </p>
                ) : null}
              </fieldset>

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
                      enters multiple classes or days.
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
                />{" "}
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
