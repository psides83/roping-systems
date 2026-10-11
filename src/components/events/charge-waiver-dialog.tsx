"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect, useState } from "react";
import { CircleSlash2, LoaderCircle, RotateCcw, X } from "lucide-react";
import {
  updateChargeWaiver,
  type ChargeWaiverFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";
import { formatCurrency } from "@/lib/utils";

export function ChargeWaiverDialog({
  eventId,
  chargeId,
  title,
  amountCents,
  waived,
  waiverReason,
  enabled,
}: {
  eventId: string;
  chargeId: string;
  title: string;
  amountCents: number;
  waived: boolean;
  waiverReason: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateChargeWaiver.bind(null, eventId, chargeId);
  const [state, action, pending] = useActionState<
    ChargeWaiverFormState,
    FormData
  >(boundAction, {});
  const Icon = waived ? RotateCcw : CircleSlash2;

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
        disabled={!enabled}
        aria-label={`${waived ? "Restore" : "Waive"} ${title}`}
        title={waived ? "Restore charge" : "Waive charge"}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#66716b] hover:bg-white hover:text-[#17201c] disabled:opacity-40"
      >
        <Icon size={14} />
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
            aria-labelledby={`charge-waiver-${chargeId}`}
            className="relative my-8 w-full max-w-md rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`charge-waiver-${chargeId}`} className="font-bold">
                  {waived ? "Restore charge" : "Waive charge"}
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  {title} · {formatCurrency(amountCents)}
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
            <PersistentForm action={action} className="space-y-4 p-5">
              <input
                type="hidden"
                name="action"
                value={waived ? "restore" : "waive"}
              />
              {waived && waiverReason ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <span className="font-semibold">Waiver reason:</span>{" "}
                  {waiverReason}
                </div>
              ) : null}
              <label className="block text-sm font-semibold">
                {waived ? "Restoration reason" : "Waiver reason"}
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                  rows={3}
                  placeholder={
                    waived
                      ? "Why is this charge being restored?"
                      : "Why is this fee being waived?"
                  }
                  className="mt-2 w-full resize-y rounded-md border border-[#ccd4d0] px-3 py-2 outline-none focus:border-[var(--brand-accent)]"
                />
                <span className="mt-1 block text-xs font-normal text-[#758078]">
                  The reason and your account will be saved in the changelog.
                </span>
              </label>
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
                    <Icon size={16} />
                  )}
                  {waived ? "Restore charge" : "Waive charge"}
                </button>
              </div>
            </PersistentForm>
          </section>
        </div>
      ) : null}
    </>
  );
}
