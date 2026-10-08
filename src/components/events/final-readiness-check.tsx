"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { getFinalReadiness } from "@/app/(app)/events/[eventId]/readiness-actions";
import type { FinalReadiness } from "@/lib/events/final-readiness";
import { formatCurrency } from "@/lib/utils";

export function FinalReadinessCheck({ eventId, ropingId, onReady }: { eventId: string; ropingId?: string; onReady: (ready: boolean) => void }) {
  const [result, setResult] = useState<{ summary?: FinalReadiness; message?: string }>({});
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    onReady(false);
    startTransition(async () => {
      const next = await getFinalReadiness(eventId, ropingId);
      if (active) { setResult(next); onReady(Boolean(next.summary && !next.summary.blocked)); }
    });
    return () => { active = false; };
  }, [eventId, ropingId, onReady]);
  function refresh() {
    onReady(false);
    startTransition(async () => {
      const next = await getFinalReadiness(eventId, ropingId);
      setResult(next); onReady(Boolean(next.summary && !next.summary.blocked));
    });
  }
  return <section aria-label="Final readiness check" aria-busy={pending} className="space-y-3 border-y border-[#dfe4e1] py-4">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">Final readiness check</h3><button type="button" onClick={refresh} disabled={pending} title="Refresh readiness check" aria-label="Refresh readiness check" className="grid h-9 w-9 place-items-center rounded-md border disabled:opacity-50"><RefreshCw size={16} /></button></div>
    {pending ? <p role="status" className="flex items-center gap-2 py-3 text-sm font-semibold"><LoaderCircle className="animate-spin" size={20} />Checking runs and payouts...</p> : result.message ? <p role="alert" className="text-sm text-rose-700">{result.message}</p> : result.summary ? <>
      <p role="status" className={`text-sm font-semibold ${result.summary.blocked ? "text-rose-700" : "text-emerald-700"}`}>{result.summary.pending} unresolved runs · {result.summary.reruns} reruns required</p>
      <div className="text-sm text-[#526059]">
        {result.summary.payoutsDueCents !== undefined ? <p>{formatCurrency(result.summary.payoutsDueCents)} winnings awaiting payment</p> : null}
        {result.summary.unconfirmedReceipts !== undefined ? <p>{result.summary.unconfirmedReceipts} payout receipts awaiting acknowledgment</p> : null}
        {result.summary.paymentCheckMessage ? <p className="text-amber-800">{result.summary.paymentCheckMessage}</p> : null}
      </div>
      <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">{result.summary.ropings.map((roping) => <li key={roping.id}>
        <p className="font-semibold">{roping.name}</p>
        {roping.pending || roping.reruns || roping.shortRoundIssue ? <p className="text-rose-700">{roping.pending} unresolved · {roping.reruns} reruns{roping.shortRoundIssue ? " · Short-round field must be built and locked" : ""} <Link className="underline" href={`/events/${eventId}/live?division=${roping.id}`}>Open timing desk</Link></p> : <p className="text-emerald-700">Competition resolved</p>}
        {roping.payoutIssues.map((issue, index) => <p key={index} className="mt-1 text-amber-800">{issue}</p>)}
      </li>)}</ul>
      <p className="text-xs text-[#66716b]">Payout warnings and unpaid winnings do not block completion or official results. <Link className="font-semibold underline" href={`/events/${eventId}/payouts`}>Review payouts</Link></p>
    </> : null}
  </section>;
}
