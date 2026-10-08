"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Banknote, LoaderCircle, X } from "lucide-react";
import { recordRoperPayout, updatePayoutReceipt } from "@/app/(app)/events/[eventId]/payouts/actions";
import { formatCurrency } from "@/lib/utils";

export interface PaymentDialogTarget {
  roperId: string;
  name: string;
  dueCents: number;
  receiptId?: string;
}

export function PayoutPaymentDialog({ eventId, ropingId, target, onClose }: {
  eventId: string; ropingId: string | null; target: PaymentDialogTarget; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const reversing = Boolean(target.receiptId);
  useEffect(() => { ref.current?.showModal(); }, []);
  function submit(form: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = reversing
          ? await updatePayoutReceipt(eventId, target.receiptId!, "reverse", String(form.get("reason") ?? ""))
          : await recordRoperPayout(eventId, target.roperId, ropingId, reference, form);
        if (result.error) setError(result.error);
        else onClose();
      } catch { setError("Unable to save the payment. Please try again."); }
    });
  }
  const input = "h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
  return <dialog ref={ref} onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}
    aria-labelledby="payout-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,540px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40">
    <header className="flex items-start justify-between gap-4 border-b border-[#dfe4e1] p-5">
      <div><h2 id="payout-dialog-title" className="flex items-center gap-2 text-lg font-bold"><Banknote size={20} />{reversing ? "Reverse payment" : "Record payout"}</h2><p className="mt-1 text-sm text-[#66716b]">{target.name}</p></div>
      <button type="button" onClick={onClose} disabled={pending} aria-label="Close" title="Close" className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#eef1ef]"><X size={20} /></button>
    </header>
    <form action={submit} aria-busy={pending} className="space-y-5 p-5">
      <fieldset disabled={pending} className="space-y-5">
      {reversing ? <label className="block text-sm font-semibold">Reason for reversal<textarea autoFocus name="reason" required maxLength={1000} rows={3} className="mt-2 block w-full rounded-md border border-[#ccd4d0] p-3" /></label> : <>
        <p className="text-sm">Balance due <strong className="ml-2 text-lg">{formatCurrency(target.dueCents)}</strong></p>
        <div className="flex flex-wrap gap-4">
          <label className="grid gap-2 text-sm font-semibold">Amount ($)<input autoFocus name="amount" type="number" min="0.01" max={(target.dueCents / 100).toFixed(2)} step="0.01" required defaultValue={(target.dueCents / 100).toFixed(2)} className={`${input} w-36`} /></label>
          <label className="grid gap-2 text-sm font-semibold">Payment method<select name="method" className={`${input} w-36`}><option value="cash">Cash</option><option value="check">Check</option><option value="other">Other</option></select></label>
        </div>
        <label className="grid justify-items-start gap-2 text-sm font-semibold">Received by<input name="recipient" required maxLength={200} defaultValue={target.name} className={`${input} w-72`} /></label>
        <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" name="confirmed" className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]" />Recipient confirmed receipt</label>
        <label className="grid justify-items-start gap-2 text-sm font-semibold">Note (optional)<textarea name="note" maxLength={1000} rows={2} className="w-80 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm" /></label>
      </>}
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      </fieldset>
      <footer className="flex justify-end gap-2 border-t border-[#dfe4e1] pt-4">
        <button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button>
        <button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Saving..." : reversing ? "Reverse payment" : "Record payout"}</button>
      </footer>
    </form>
  </dialog>;
}
