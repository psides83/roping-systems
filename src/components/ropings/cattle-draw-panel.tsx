"use client";

import { useActionState, useEffect, useState } from "react";
import { Beef, Dices, LoaderCircle, Settings2, X } from "lucide-react";
import {
  drawRoundCattle,
  saveEventCattle,
  type CattleFormState,
} from "@/app/(app)/ropings/[ropingId]/actions";

export function CattleDrawPanel({
  ropingId,
  divisionId,
  runNumber,
  cattleTags,
  assignedCount,
  runCount,
  canEdit,
  canRedraw,
}: {
  ropingId: string;
  divisionId: string;
  runNumber: number;
  cattleTags: string[];
  assignedCount: number;
  runCount: number;
  canEdit: boolean;
  canRedraw: boolean;
}) {
  const [open, setOpen] = useState(false);
  const saveAction = saveEventCattle.bind(null, ropingId);
  const drawAction = drawRoundCattle.bind(null, ropingId);
  const [saveState, saveFormAction, savePending] = useActionState<
    CattleFormState,
    FormData
  >(saveAction, {});
  const [drawState, drawFormAction, drawPending] = useActionState<
    CattleFormState,
    FormData
  >(drawAction, {});

  useEffect(() => {
    if (!saveState.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [saveState.success]);

  return (
    <section className="rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Beef
            size={18}
            className="mt-0.5 shrink-0 text-[var(--brand-accent-strong)]"
          />
          <div>
            <p className="text-sm font-bold">Cattle draw</p>
            <p className="mt-1 text-xs text-[#758078]">
              {cattleTags.length} active · {assignedCount}/{runCount} assigned
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canEdit}
          aria-label="Manage cattle list"
          title="Manage cattle list"
          className="grid h-8 w-8 place-items-center rounded-md border border-[#d7ddda] disabled:opacity-40"
        >
          <Settings2 size={15} />
        </button>
      </div>

      <form action={drawFormAction} className="mt-3">
        <input type="hidden" name="divisionId" value={divisionId} />
        <input type="hidden" name="runNumber" value={runNumber} />
        <button
          disabled={!canEdit || !canRedraw || !cattleTags.length || drawPending}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md brand-primary-fill text-xs font-semibold text-white disabled:opacity-40"
        >
          {drawPending ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Dices size={15} />
          )}
          {assignedCount ? "Redraw cattle" : "Draw cattle"}
        </button>
      </form>
      {drawState.message ? (
        <p
          className={`mt-2 text-xs ${drawState.success ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {drawState.message}
        </p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-cattle-heading"
            className="relative w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id="event-cattle-heading" className="font-bold">
                  Event cattle
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  One tag or number per line. This list is shared across the
                  event.
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
            <form action={saveFormAction} className="space-y-4 p-5">
              <textarea
                name="cattleTags"
                defaultValue={cattleTags.join("\n")}
                rows={10}
                placeholder={"101\n102\n103"}
                className="w-full resize-y rounded-md border border-[#ccd4d0] px-3 py-2 font-mono text-sm"
              />
              <p className="text-xs leading-5 text-[#758078]">
                Removing a number makes it inactive for future draws while
                preserving its earlier run history.
              </p>
              {saveState.message ? (
                <p
                  className={`rounded-md p-3 text-sm ${saveState.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
                  aria-live="polite"
                >
                  {saveState.message}
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
                  disabled={savePending}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {savePending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Save cattle
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
