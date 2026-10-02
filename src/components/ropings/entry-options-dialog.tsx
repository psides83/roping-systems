"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Settings2, X } from "lucide-react";
import {
  updateEntryOptions,
  type EntryOptionFormState,
} from "@/app/(app)/ropings/[ropingId]/entries/actions";
import { formatCurrency } from "@/lib/utils";

export interface EntryOptionChoice {
  id: string;
  title: string;
  amountCents: number;
  kind: string;
  scope: string;
  selected: boolean;
}

export function EntryOptionsDialog({
  ropingId,
  entryId,
  contestantName,
  divisionName,
  options,
  enabled,
}: {
  ropingId: string;
  entryId: string;
  contestantName: string;
  divisionName: string;
  options: EntryOptionChoice[];
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(
    () =>
      new Set(
        options.filter((option) => option.selected).map((option) => option.id),
      ),
  );
  const boundAction = updateEntryOptions.bind(null, ropingId, entryId);
  const [state, action, pending] = useActionState<
    EntryOptionFormState,
    FormData
  >(boundAction, {});
  const selectedTotal = useMemo(
    () =>
      options.reduce(
        (total, option) =>
          total + (selectedIds.has(option.id) ? option.amountCents : 0),
        0,
      ),
    [options, selectedIds],
  );

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  if (!options.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!enabled}
        aria-label={`Manage optional fees for ${contestantName}'s ${divisionName} entry`}
        title="Manage side pots and optional fees"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#66716b] hover:bg-white hover:text-[#17201c] disabled:opacity-40"
      >
        <Settings2 size={14} />
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
            aria-labelledby={`entry-options-${entryId}`}
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`entry-options-${entryId}`} className="font-bold">
                  Side pots and optional fees
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  {contestantName} · {divisionName}
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
              <fieldset>
                <legend className="text-sm font-semibold">
                  Included with this entry
                </legend>
                <div className="mt-2 space-y-2">
                  {options.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-[#e1e6e3] p-3 hover:bg-[#fafbfa]"
                    >
                      <input
                        name="optionIds"
                        value={option.id}
                        type="checkbox"
                        checked={selectedIds.has(option.id)}
                        onChange={(event) => {
                          const next = new Set(selectedIds);
                          if (event.target.checked) next.add(option.id);
                          else next.delete(option.id);
                          setSelectedIds(next);
                        }}
                        className="h-4 w-4 accent-[var(--brand-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-xs capitalize text-[#758078]">
                          {option.kind.replaceAll("_", " ")} ·{" "}
                          {option.scope === "entry"
                            ? "each entry"
                            : "once per contestant"}
                        </span>
                      </span>
                      <span className="text-sm font-bold">
                        {formatCurrency(option.amountCents)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center justify-between rounded-md bg-[#f3f5f4] px-4 py-3 text-sm">
                <span className="font-semibold">Selected optional fees</span>
                <span className="font-bold">
                  {formatCurrency(selectedTotal)}
                </span>
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
                    <Settings2 size={16} />
                  )}
                  Save options
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
