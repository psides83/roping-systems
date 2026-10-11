"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  History,
  LoaderCircle,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import {
  recordCashPayment,
  voidCashPayment,
  type CashPaymentFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";
import { formatCurrency } from "@/lib/utils";

export interface CashPaymentRecord {
  id: string;
  amountCents: number;
  note: string | null;
  receivedBy: string;
  receivedAt: string;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
}

export function CashPaymentDialog({
  eventId,
  personId,
  contestantName,
  balanceDueCents,
  payments,
  enabled,
  canVoid = enabled,
}: {
  eventId: string;
  personId: string;
  contestantName: string;
  balanceDueCents: number;
  payments: CashPaymentRecord[];
  enabled: boolean;
  canVoid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = recordCashPayment.bind(null, eventId, personId);
  const [state, action, pending] = useActionState<
    CashPaymentFormState,
    FormData
  >(boundAction, {});

  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  if (!balanceDueCents && !payments.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!enabled}
        className="mt-2 flex h-8 items-center gap-1.5 rounded-md border border-[#ccd4d0] bg-white px-2.5 text-[11px] font-semibold text-[#46524b] disabled:opacity-50"
      >
        {balanceDueCents ? <Banknote size={13} /> : <History size={13} />}
        {balanceDueCents ? "Record cash" : "Payment history"}
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
            aria-labelledby={`cash-payment-${personId}`}
            className="relative my-8 w-full max-w-lg rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 id={`cash-payment-${personId}`} className="font-bold">
                  Cash payments
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">{contestantName}</p>
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
            <div className="space-y-5 p-5">
              {balanceDueCents ? (
                <PersistentForm action={action} className="space-y-4">
                  <div className="rounded-md bg-[#f3f5f4] px-4 py-3">
                    <p className="text-xs font-semibold text-[#66716b]">
                      Remaining balance
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCurrency(balanceDueCents)}
                    </p>
                  </div>
                  <label className="block text-sm font-semibold">
                    Amount received
                    <div className="mt-2 flex h-11 items-center rounded-md border border-[#ccd4d0] bg-white px-3 focus-within:border-[var(--brand-accent)]">
                      <span className="text-[#66716b]">$</span>
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        max={(balanceDueCents / 100).toFixed(2)}
                        step="0.01"
                        defaultValue={(balanceDueCents / 100).toFixed(2)}
                        required
                        className="min-w-0 flex-1 bg-transparent px-2 outline-none"
                      />
                    </div>
                  </label>
                  <label className="block text-sm font-semibold">
                    Note{" "}
                    <span className="font-normal text-[#758078]">
                      (optional)
                    </span>
                    <input
                      name="note"
                      maxLength={240}
                      placeholder="Cash drawer or receipt note"
                      className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 outline-none focus:border-[var(--brand-accent)]"
                    />
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
                        <Banknote size={16} />
                      )}
                      Record payment
                    </button>
                  </div>
                </PersistentForm>
              ) : (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  Balance paid in full
                </div>
              )}
              {payments.length ? (
                <section>
                  <h3 className="text-sm font-bold">Payment history</h3>
                  <div className="mt-2 divide-y divide-[#e7ebe8] rounded-md border border-[#e1e6e3]">
                    {payments.map((payment) => (
                      <div
                        key={payment.id}
                        className={`p-3 text-sm ${payment.voided ? "bg-[#f7f8f7] text-[#758078]" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">
                              {payment.receivedAt}
                            </p>
                            <p className="mt-1 text-xs text-[#66716b]">
                              Accepted by {payment.receivedBy}
                            </p>
                            {payment.note ? (
                              <p className="mt-1 text-xs text-[#66716b]">
                                {payment.note}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`font-bold ${payment.voided ? "line-through" : ""}`}
                          >
                            {formatCurrency(payment.amountCents)}
                          </span>
                        </div>
                        {payment.voided ? (
                          <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs">
                            Voided by {payment.voidedBy} on {payment.voidedAt}:{" "}
                            {payment.voidReason}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            href={`/events/${eventId}/entries/payments/${payment.id}/receipt`}
                            target="_blank"
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#ccd4d0] bg-white px-2.5 text-xs font-semibold text-[#46524b]"
                          >
                            <Printer size={13} /> Receipt
                          </Link>
                          {!payment.voided && canVoid ? (
                            <VoidPaymentForm
                              eventId={eventId}
                              paymentId={payment.id}
                            />
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function VoidPaymentForm({
  eventId,
  paymentId,
}: {
  eventId: string;
  paymentId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const boundAction = voidCashPayment.bind(null, eventId, paymentId);
  const [state, action, pending] = useActionState<
    CashPaymentFormState,
    FormData
  >(boundAction, {});

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-700"
      >
        <RotateCcw size={13} /> Void payment
      </button>
    );

  return (
    <PersistentForm
      action={action}
      className="w-full rounded-md border border-rose-200 bg-rose-50 p-3"
    >
      <label className="text-xs font-bold text-rose-900">
        Correction reason
        <input
          name="reason"
          required
          minLength={5}
          maxLength={240}
          autoFocus
          className="mt-2 h-9 w-full rounded-md border border-rose-200 bg-white px-2 text-sm text-[#17201c]"
          placeholder="Payment entered twice"
        />
      </label>
      {state.message ? (
        <p className="mt-2 text-xs text-rose-800">{state.message}</p>
      ) : null}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="h-8 px-2 text-xs font-semibold"
        >
          Cancel
        </button>
        <button
          disabled={pending}
          className="h-8 rounded-md bg-rose-700 px-3 text-xs font-bold text-white disabled:opacity-50"
        >
          {pending ? "Voiding..." : "Confirm void"}
        </button>
      </div>
    </PersistentForm>
  );
}
