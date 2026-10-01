"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRightLeft, LoaderCircle, X } from "lucide-react";
import {
  transferEntry,
  type TransferFormState,
} from "@/app/(app)/ropings/[ropingId]/entries/actions";

export interface TransferDivision {
  id: string;
  name: string;
}

export function EntryTransferDialog({
  ropingId,
  entryId,
  contestantName,
  currentDivisionId,
  currentDivisionName,
  divisions,
  enabled,
}: {
  ropingId: string;
  entryId: string;
  contestantName: string;
  currentDivisionId: string;
  currentDivisionName: string;
  divisions: TransferDivision[];
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [overrideEligibility, setOverrideEligibility] = useState(false);
  const destinationDivisions = divisions.filter(
    (division) => division.id !== currentDivisionId,
  );
  const boundAction = transferEntry.bind(null, ropingId, entryId);
  const [state, action, pending] = useActionState<TransferFormState, FormData>(
    boundAction,
    {},
  );

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
        disabled={!enabled || destinationDivisions.length === 0}
        aria-label={`Move ${contestantName}'s entry from ${currentDivisionName}`}
        title="Move entry"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#66716b] hover:bg-white hover:text-[#17201c] disabled:opacity-40"
      >
        <ArrowRightLeft size={14} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`transfer-entry-${entryId}`}
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`transfer-entry-${entryId}`} className="font-bold">
                  Move entry
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  {contestantName} · {currentDivisionName}
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
            <form action={action} className="space-y-4 p-5">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Recorded runs will be archived in the entry history and excluded
                from results and payouts. Fresh pending runs will be created in
                the destination class.
              </div>
              <label className="block text-sm font-semibold">
                Destination class
                <select
                  name="destinationDivisionId"
                  required
                  defaultValue=""
                  className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3"
                >
                  <option value="" disabled>
                    Choose a class
                  </option>
                  {destinationDivisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
                {state.errors?.destinationDivisionId?.map((error) => (
                  <span
                    key={error}
                    className="mt-1 block text-xs text-rose-700"
                  >
                    {error}
                  </span>
                ))}
              </label>
              <label className="block text-sm font-semibold">
                Reason
                <textarea
                  name="reason"
                  required
                  maxLength={240}
                  rows={3}
                  placeholder="Entered in the wrong class"
                  className="mt-2 w-full resize-y rounded-md border border-[#ccd4d0] px-3 py-2"
                />
                {state.errors?.reason?.map((error) => (
                  <span
                    key={error}
                    className="mt-1 block text-xs text-rose-700"
                  >
                    {error}
                  </span>
                ))}
              </label>
              <div className="rounded-md border border-[#d9dfdc] bg-[#f7f8f7] p-3">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="eligibilityOverride"
                    checked={overrideEligibility}
                    onChange={(event) =>
                      setOverrideEligibility(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 accent-[#be3f27]"
                  />
                  <span>
                    <span className="block font-semibold text-[#17201c]">
                      Approve an eligibility exception
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#66716b]">
                      Use this only when event staff are approving a membership,
                      classification, or age exception for the destination
                      class.
                    </span>
                  </span>
                </label>
                {overrideEligibility ? (
                  <label className="mt-3 block text-sm font-semibold">
                    Exception reason
                    <textarea
                      name="eligibilityOverrideReason"
                      required
                      minLength={5}
                      maxLength={300}
                      rows={2}
                      placeholder="Approved by the event producer"
                      className="mt-2 w-full resize-y rounded-md border border-[#ccd4d0] bg-white px-3 py-2"
                    />
                    {state.errors?.eligibilityOverrideReason?.map((error) => (
                      <span
                        key={error}
                        className="mt-1 block text-xs text-rose-700"
                      >
                        {error}
                      </span>
                    ))}
                  </label>
                ) : (
                  <input
                    type="hidden"
                    name="eligibilityOverrideReason"
                    value=""
                  />
                )}
              </div>
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
                  ) : (
                    <ArrowRightLeft size={16} />
                  )}
                  Move entry
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
