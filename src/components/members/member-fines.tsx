"use client";

import { useState } from "react";
import { Banknote, CircleAlert, Plus, RotateCcw, ShieldCheck, X } from "lucide-react";
import { fineBalance, fineRestrictionLabels, fineStatus, type MemberFine } from "@/lib/member-fines";
import { MemberFineDialog, type FineDialogTarget } from "./member-fine-dialog";
import { formatCurrency } from "@/lib/utils";

const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
export function MemberFines({ membershipId, fines, ropings, canManage, allowIssue = true }: {
  membershipId: string; fines: MemberFine[]; ropings: { id: string; name: string }[]; canManage: boolean; allowIssue?: boolean;
}) {
  const [target, setTarget] = useState<FineDialogTarget | null>(null);
  const balance = fines.reduce((sum, fine) => sum + fineBalance(fine), 0);
  return <section aria-labelledby={`fines-${membershipId}`} className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4e1] pb-3"><div><h2 id={`fines-${membershipId}`} className="flex items-center gap-2 text-lg font-bold"><CircleAlert size={19} />Member fines</h2><p className="mt-1 text-sm text-[#66716b]">Outstanding balance <strong className="ml-2 text-[#19231d]">{formatCurrency(balance)}</strong></p></div>{canManage && allowIssue ? <button type="button" onClick={() => setTarget({ operation: "issue" })} className="flex h-9 items-center gap-2 rounded-md brand-primary-fill px-3 text-sm font-semibold text-white"><Plus size={16} />Issue fine</button> : null}</header>
    {!fines.length ? <p className="py-3 text-sm text-[#66716b]">No fines recorded.</p> : <div className="divide-y divide-[#dfe4e1]">{fines.map((fine) => {
      const due = fineBalance(fine);
      const reversed = new Set(fine.transactions.map((transaction) => transaction.reversesId));
      return <article key={fine.id} className="py-4 first:pt-0">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{fine.reason}</p><p className="mt-1 text-xs text-[#66716b]">{date(fine.issuedAt)} · {fine.staff}</p><p className={`mt-2 text-sm ${due && fine.restriction !== "none" ? "font-semibold text-red-700" : "text-[#66716b]"}`}>{due ? fineRestrictionLabels[fine.restriction] : "Restriction cleared"}</p></div><div className="text-right"><strong className="text-lg">{formatCurrency(due)}</strong><p className="mt-1 text-xs text-[#66716b]">{fineStatus(fine)} · Original {formatCurrency(fine.amountCents)}</p></div></div>
        {canManage && due > 0 ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setTarget({ operation: "payment", fine })} className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold"><Banknote size={15} />Record cash payment</button><button type="button" onClick={() => setTarget({ operation: "waiver", fine })} className="h-9 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold">Waive balance</button>{fine.restriction !== "none" ? <button type="button" onClick={() => setTarget({ operation: "exception", fine })} className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold"><ShieldCheck size={15} />Temporary exception</button> : null}</div> : null}
        {fine.exceptions.length ? <ul className="mt-3 space-y-2">{fine.exceptions.map((exception) => <li key={exception.id} className="flex flex-wrap justify-between gap-3 border-l-2 border-amber-300 pl-3 text-xs"><div><p className="font-semibold">{exception.revokedAt ? "Exception revoked" : `Exception expires ${date(exception.expiresAt)}`}{exception.ropingId ? " · Single roping" : " · All ropings"}</p><p className="mt-1">{exception.reason}</p><p className="mt-1 text-[#66716b]">{date(exception.createdAt)} · {exception.staff}</p>{exception.revocationReason ? <p className="mt-1 text-red-700">{exception.revocationReason}</p> : null}</div>{canManage && !exception.revokedAt ? <button type="button" onClick={() => setTarget({ operation: "revoke", fine, exceptionId: exception.id })} title="Revoke exception" aria-label="Revoke exception" className="grid h-8 w-8 place-items-center rounded-md border border-[#ccd4d0] bg-white"><X size={14} /></button> : null}</li>)}</ul> : null}
        {fine.transactions.length ? <details className="mt-4"><summary className="w-fit cursor-pointer text-xs font-semibold text-[#526058]">Payment and change history ({fine.transactions.length})</summary><ul className="mt-2 divide-y divide-[#e7ebe8]">{fine.transactions.map((transaction) => <li key={transaction.id} className="flex flex-wrap justify-between gap-3 py-3 text-xs"><div><p className="font-semibold">{transaction.kind === "payment" ? "Cash payment" : transaction.kind === "waiver" ? "Waiver" : "Reversal"} · {formatCurrency(transaction.amountCents)}{reversed.has(transaction.id) ? " · Reversed" : ""}</p><p className="mt-1">{transaction.reason}</p><p className="mt-1 text-[#66716b]">{date(transaction.createdAt)} · {transaction.staff}</p></div>{canManage && transaction.kind !== "reversal" && !reversed.has(transaction.id) ? <button type="button" onClick={() => setTarget({ operation: "reversal", fine, transactionId: transaction.id })} title="Reverse transaction" aria-label="Reverse transaction" className="grid h-8 w-8 place-items-center rounded-md border border-[#ccd4d0] bg-white"><RotateCcw size={14} /></button> : null}</li>)}</ul></details> : null}
      </article>;
    })}</div>}
    {target ? <MemberFineDialog membershipId={membershipId} target={target} ropings={ropings} onClose={() => setTarget(null)} /> : null}
  </section>;
}
