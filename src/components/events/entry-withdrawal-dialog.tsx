"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, RotateCcw, UserMinus, X } from "lucide-react";
import {
  changeEntryWithdrawal,
  type EntryWithdrawalFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";

export function EntryWithdrawalDialog({
  eventId,
  entryId,
  contestantName,
  divisionName,
  withdrawn,
  withdrawalReason,
  enabled,
}: {
  eventId: string;
  entryId: string;
  contestantName: string;
  divisionName: string;
  withdrawn: boolean;
  withdrawalReason: string | null;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = changeEntryWithdrawal.bind(null, eventId, entryId);
  const [state, action, pending] = useActionState<
    EntryWithdrawalFormState,
    FormData
  >(boundAction, {});
  const Icon = withdrawn ? RotateCcw : UserMinus;

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
        aria-label={`${withdrawn ? "Reinstate" : "Withdraw"} ${contestantName}'s ${divisionName} entry`}
        title={withdrawn ? "Reinstate entry" : "Withdraw entry"}
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
            aria-labelledby={`entry-withdrawal-${entryId}`}
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`entry-withdrawal-${entryId}`} className="font-bold">
                  {withdrawn ? "Reinstate entry" : "Withdraw entry"}
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
              <input
                type="hidden"
                name="action"
                value={withdrawn ? "reinstate" : "withdraw"}
              />
              {withdrawn && withdrawalReason ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
                  <span className="font-semibold">Withdrawal reason:</span>{" "}
                  {withdrawalReason}
                </div>
              ) : null}
              {!withdrawn ? (
                <fieldset>
                  <legend className="text-sm font-semibold">
                    Fee handling
                  </legend>
                  <div className="mt-2 space-y-2">
                    <FinancialChoice
                      value="keep_charges"
                      title="Keep charges"
                      detail="Use for a paid entry that still counts toward the purse."
                      defaultChecked
                    />
                    <FinancialChoice
                      value="waive_charges"
                      title="Waive this entry’s charges"
                      detail="Use when no payment is due. Once-per-event fees remain unchanged."
                    />
                    <FinancialChoice
                      value="refund"
                      title="Mark entry refunded"
                      detail="Removes this entry from paid-entry payout calculations."
                    />
                  </div>
                </fieldset>
              ) : null}
              <label className="block text-sm font-semibold">
                {withdrawn ? "Reinstatement reason" : "Withdrawal reason"}
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                  rows={3}
                  placeholder={
                    withdrawn
                      ? "Why is this entry being reinstated?"
                      : "Why is this entry being withdrawn?"
                  }
                  className="mt-2 w-full resize-y rounded-md border border-[#ccd4d0] px-3 py-2 outline-none focus:border-[var(--brand-accent)]"
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-[#758078]">
                  Unresolved runs are archived. Recorded performances remain in
                  the audit history.
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
                  {withdrawn ? "Reinstate entry" : "Withdraw entry"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function FinancialChoice({
  value,
  title,
  detail,
  defaultChecked = false,
}: {
  value: string;
  title: string;
  detail: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#e1e6e3] p-3 hover:bg-[#fafbfa]">
      <input
        type="radio"
        name="financialAction"
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#66716b]">
          {detail}
        </span>
      </span>
    </label>
  );
}
