"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, X } from "lucide-react";
import { saveMemberFine, type FineOperation } from "@/app/(app)/members/[membershipId]/fine-actions";
import { fineRestrictionLabels, type MemberFine, fineBalance } from "@/lib/member-fines";
import { formatCurrency } from "@/lib/utils";

export interface FineDialogTarget { operation: FineOperation; fine?: MemberFine; transactionId?: string; exceptionId?: string }
const titles: Record<FineOperation, string> = { issue: "Issue fine", payment: "Record cash payment", waiver: "Waive fine balance", reversal: "Reverse fine transaction", exception: "Approve temporary exception", revoke: "Revoke exception" };

export function MemberFineDialog({ membershipId, target, ropings, onClose }: {
  membershipId: string; target: FineDialogTarget; ropings: { id: string; name: string }[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const balance = target.fine ? fineBalance(target.fine) : 0;
  const showAmount = ["issue", "payment", "waiver"].includes(target.operation);
  const showRoping = target.operation === "issue" || target.operation === "exception";
  useEffect(() => { ref.current?.showModal(); }, []);
  function submit(form: FormData) {
    setError("");
    const expires = String(form.get("expiresAt") ?? "");
    if (expires) {
      if (Number.isNaN(Date.parse(expires))) { setError("Choose a valid expiry date and time."); return; }
      form.set("expiresAt", new Date(expires).toISOString());
    }
    startTransition(async () => {
      try {
        const result = await saveMemberFine(membershipId, target.operation, target.fine?.id ?? null, reference, form);
        if (result.error) setError(result.error); else onClose();
      } catch { setError("Unable to save this change. Please try again."); }
    });
  }
  const input = "h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
  return <dialog ref={ref} aria-labelledby="fine-dialog-title" onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40">
    <header className="flex items-start justify-between gap-4 border-b border-[#dfe4e1] p-5"><div><h2 id="fine-dialog-title" className="text-lg font-bold">{titles[target.operation]}</h2>{target.fine ? <p className="mt-1 text-sm text-[#66716b]">Balance {formatCurrency(balance)}</p> : null}</div><button type="button" disabled={pending} onClick={onClose} aria-label="Close" title="Close" className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#eef1ef]"><X size={20} /></button></header>
    <form action={submit} className="space-y-5 p-5">
      {target.transactionId ? <input type="hidden" name="transactionId" value={target.transactionId} /> : null}
      {target.exceptionId ? <input type="hidden" name="exceptionId" value={target.exceptionId} /> : null}
      {showAmount ? <label className="grid justify-items-start gap-2 text-sm font-semibold">Amount ($)<input autoFocus name="amount" type="number" required min="0.01" step="0.01" max={target.fine ? (balance / 100).toFixed(2) : undefined} defaultValue={target.fine ? (balance / 100).toFixed(2) : undefined} className={`${input} w-40`} /></label> : null}
      {target.operation === "issue" ? <label className="grid justify-items-start gap-2 text-sm font-semibold">Restriction<select name="restriction" className={`${input} w-full sm:w-96`} defaultValue="none">{Object.entries(fineRestrictionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
      {showRoping ? <label className="grid justify-items-start gap-2 text-sm font-semibold">{target.operation === "issue" ? "Roping where fine occurred (optional)" : "Exception scope"}<select name="ropingId" className={`${input} w-80`}><option value="">{target.operation === "issue" ? "No specific roping" : "All ropings until expiry"}</option>{ropings.map((roping) => <option key={roping.id} value={roping.id}>{roping.name}</option>)}</select></label> : null}
      {target.operation === "exception" ? <label className="grid justify-items-start gap-2 text-sm font-semibold">Expires at<input name="expiresAt" type="datetime-local" required className={`${input} w-60`} /></label> : null}
      <label className="grid justify-items-start gap-2 text-sm font-semibold">Reason<textarea autoFocus={!showAmount} name="reason" required minLength={5} maxLength={2000} defaultValue={target.operation === "payment" ? "Cash payment received" : ""} rows={3} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm" /></label>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <footer className="flex justify-end gap-2 border-t border-[#dfe4e1] pt-4"><button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Saving..." : "Save"}</button></footer>
    </form>
  </dialog>;
}
