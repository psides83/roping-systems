"use client";

import { Fragment, useState, useTransition } from "react";
import { Banknote, Check, ChevronDown, ChevronRight, LoaderCircle, RotateCcw, Search } from "lucide-react";
import { payoutStage, payoutStatus, registerRopers, type PayoutReceipt, type RegisterAward } from "@/lib/events/payout-register";
import { updatePayoutReceipt } from "@/app/(app)/events/[eventId]/payouts/actions";
import { PayoutPaymentDialog, type PaymentDialogTarget } from "./payout-payment-dialog";
import { formatCurrency } from "@/lib/utils";

const date = (value: string) => new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago",
}).format(new Date(value));

export function PayoutRegister({ eventId, awards, receipts, canManage }: {
  eventId: string; awards: RegisterAward[]; receipts: PayoutReceipt[]; canManage: boolean;
}) {
  const [scope, setScope] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [target, setTarget] = useState<PaymentDialogTarget | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const ropings = [...new Map(awards.map((award) => [award.ropingId, award.ropingName])).entries()];
  const ropers = registerRopers(awards.filter((award) => !scope || award.ropingId === scope));
  const visible = ropers.filter((roper) => `${roper.name} ${roper.memberNumber ?? ""}`.toLowerCase().includes(query.toLowerCase())
    && (status === "all" || (status === "due" ? roper.dueCents > 0 : payoutStatus(roper) === status)));
  const totals = ropers.reduce((sum, roper) => ({ winnings: sum.winnings + roper.totalCents, paid: sum.paid + roper.paidCents, due: sum.due + roper.dueCents }), { winnings: 0, paid: 0, due: 0 });
  function confirm(receipt: PayoutReceipt) {
    if (!window.confirm(`Record that ${receipt.recipient} acknowledged receiving ${formatCurrency(receipt.amountCents)}?`)) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await updatePayoutReceipt(eventId, receipt.id, "confirm", "");
        if (result.error) setError(result.error);
      } catch { setError("Unable to confirm receipt. Please try again."); }
    });
  }
  return <section aria-labelledby="payout-register-title" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2 id="payout-register-title" className="flex items-center gap-2 text-lg font-bold"><Banknote size={20} />Payout register</h2><span className="text-xs font-semibold text-[#66716b]">Finalized payouts</span></header>
    <div className="grid grid-cols-3 gap-3 border-y border-[#dfe4e1] py-4">
      {[["Winnings", totals.winnings], ["Paid", totals.paid], ["Balance due", totals.due]].map(([label, value]) => <div key={label}><p className="text-xs text-[#66716b]">{label}</p><p className="mt-1 break-words text-lg font-bold">{formatCurrency(Number(value))}</p></div>)}
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid max-w-full gap-1 text-xs font-semibold">Roping<select value={scope} onChange={(event) => { setScope(event.target.value); setExpanded([]); }} className="h-10 w-72 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="">All finalized ropings</option>{ropings.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-40 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="all">All payouts</option><option value="due">Balance due</option><option value="Unpaid">Unpaid</option><option value="Partially paid">Partially paid</option><option value="Paid">Paid</option><option value="Needs review">Needs review</option></select></label>
      <label className="relative max-w-full"><span className="sr-only">Find a roper</span><Search size={16} className="absolute left-3 top-3 text-[#758078]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a roper" className="h-10 w-40 max-w-full rounded-md border border-[#ccd4d0] pl-9 pr-3 text-sm sm:w-60" /></label>
    </div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {!awards.length ? <p className="border-y border-[#dfe4e1] py-8 text-center text-sm text-[#66716b]">No finalized payouts yet. Complete each roping, then finalize its payouts above to record payments.</p> : <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white">
      <table className="w-full text-left text-sm"><thead className="bg-[#eef1ef] text-xs text-[#66716b]"><tr><th className="p-3">Roper</th><th className="hidden p-3 text-right sm:table-cell">Winnings</th><th className="hidden p-3 text-right sm:table-cell">Paid</th><th className="p-3 text-right">Due</th><th className="hidden p-3 sm:table-cell">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody className="divide-y divide-[#dfe4e1]">{visible.map((roper) => {
          const open = expanded.includes(roper.id);
          const history = receipts.filter((receipt) => receipt.roperId === roper.id && (!scope || receipt.allocations.some((allocation) => allocation.ropingId === scope)));
          return <Fragment key={roper.id}>
            <tr><td className="p-3"><button type="button" aria-expanded={open} aria-controls={`payout-${roper.id}`} onClick={() => setExpanded((current) => open ? current.filter((id) => id !== roper.id) : [...current, roper.id])} className="flex items-center gap-2 text-left font-semibold">{open ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}<span>{roper.name}<span className="block text-xs font-normal text-[#66716b]">{roper.memberNumber ? `Member #${roper.memberNumber}` : "Guest"}</span><span className="mt-1 block text-[11px] font-normal text-[#66716b] sm:hidden">{payoutStatus(roper)} · {formatCurrency(roper.paidCents)} paid</span></span></button></td>
              <td className="hidden p-3 text-right sm:table-cell">{formatCurrency(roper.totalCents)}</td><td className="hidden p-3 text-right sm:table-cell">{formatCurrency(roper.paidCents)}</td><td className="whitespace-nowrap p-3 text-right font-bold">{formatCurrency(roper.dueCents)}</td>
              <td className="hidden p-3 sm:table-cell"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${payoutStatus(roper) === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-[#eef1ef] text-[#526058]"}`}>{payoutStatus(roper)}</span>{history.some((receipt) => !receipt.reversedAt && !receipt.confirmed) ? <span className="mt-1 block text-[11px] text-amber-700">Receipt unconfirmed</span> : null}</td>
              <td className="p-3">{canManage && roper.dueCents > 0 && !roper.needsReview ? <button type="button" aria-label={`Record payout for ${roper.name}`} title="Record payout" onClick={() => setTarget({ roperId: roper.id, name: roper.name, dueCents: roper.dueCents })} className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md brand-primary-fill px-3 text-xs font-semibold text-white"><Banknote size={15} /><span className="hidden sm:inline">Record payout</span></button> : null}</td></tr>
            {open ? <tr><td colSpan={6} id={`payout-${roper.id}`} className="bg-[#f8faf9] p-4">
              {roper.needsReview ? <p className="mb-3 text-sm font-semibold text-amber-700">Recorded payments exceed the current winnings. Review and reverse any affected payment before recording another payout.</p> : null}
              <h3 className="mb-2 text-xs font-bold uppercase text-[#66716b]">Winnings breakdown</h3>
              <ul className="divide-y divide-[#e7ebe8]">{roper.awards.toSorted((a, b) => a.ropingName.localeCompare(b.ropingName) || (a.poolType === "main" ? 0 : /insurance/i.test(a.poolName) ? 2 : 1) - (b.poolType === "main" ? 0 : /insurance/i.test(b.poolName) ? 2 : 1)).map((award) => <li key={`${award.planId}:${award.awardKey}`} className="flex justify-between gap-4 py-2 text-xs"><span><strong>{award.ropingName}</strong><span className="block text-[#66716b]">{award.poolType === "main" ? "Main" : award.poolName} · {payoutStage(award)} · Place {award.place}</span></span><span className="text-right"><strong>{formatCurrency(award.amountCents)}</strong><span className="block text-[#66716b]">{formatCurrency(award.paidCents)} paid</span></span></li>)}</ul>
              {history.length ? <><h3 className="mb-2 mt-5 text-xs font-bold uppercase text-[#66716b]">Payment history</h3><ul className="divide-y divide-[#e7ebe8]">{history.map((receipt) => <li key={receipt.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-xs"><div><p className="font-semibold">{formatCurrency(receipt.amountCents)} · {receipt.method} · {receipt.reversedAt ? "Reversed" : receipt.confirmed ? "Receipt confirmed" : "Receipt unconfirmed"}</p><p className="mt-1">Received by {receipt.recipient}</p><p className="mt-1 text-[#66716b]">{date(receipt.paidAt)} · {receipt.staff}</p>{receipt.confirmedAt ? <p className="mt-1 text-[#66716b]">Confirmed {date(receipt.confirmedAt)}</p> : null}{receipt.note ? <p className="mt-1">{receipt.note}</p> : null}{receipt.reversalReason ? <p className="mt-1 text-red-700">Reversed {date(receipt.reversedAt!)}: {receipt.reversalReason}</p> : null}{scope ? <p className="mt-1 text-[#66716b]">This roping: {formatCurrency(receipt.allocations.filter((allocation) => allocation.ropingId === scope).reduce((sum, allocation) => sum + allocation.amountCents, 0))}</p> : null}</div>
                {canManage && !receipt.reversedAt ? <div className="flex gap-2">{!receipt.confirmed ? <button type="button" disabled={pending} onClick={() => confirm(receipt)} className="flex h-8 items-center gap-1 rounded-md border border-[#ccd4d0] bg-white px-2 font-semibold">{pending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}Confirm receipt</button> : null}<button type="button" disabled={pending} onClick={() => setTarget({ roperId: roper.id, name: roper.name, dueCents: 0, receiptId: receipt.id })} className="flex h-8 items-center gap-1 rounded-md border border-[#ccd4d0] bg-white px-2 font-semibold"><RotateCcw size={14} />Reverse</button></div> : null}</li>)}</ul></> : roper.paidCents ? <p className="mt-3 text-xs text-[#66716b]">Previously recorded paid awards have no receipt confirmation.</p> : null}
            </td></tr> : null}
          </Fragment>;
        })}</tbody></table>{!visible.length ? <p className="p-6 text-center text-sm text-[#66716b]">No matching payouts.</p> : null}
    </div>}
    {target ? <PayoutPaymentDialog eventId={eventId} ropingId={scope || null} target={target} onClose={() => setTarget(null)} /> : null}
  </section>;
}
