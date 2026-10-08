"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { LoaderCircle, Pencil, X } from "lucide-react";
import { withdrawOnlineEntryRequest } from "@/app/roper/requests/actions";

export function OnlineEntryRequestActions({ requestId, revision, producerSlug, eventSlug }: { requestId: string; revision: number; producerSlug: string; eventSlug: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(withdrawOnlineEntryRequest, {});
  if (state.success) return <p role="status" className="text-sm text-emerald-700">{state.message}</p>;
  return <div className="space-y-2">
    {!confirming ? <div className="flex flex-wrap gap-2">
      <Link href={`/public/${producerSlug}/${eventSlug}/enter?request=${requestId}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold"><Pencil size={15} />Edit request</Link>
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold"><X size={15} />Withdraw</button>
    </div> : <form action={action} aria-busy={pending} className="space-y-3 border-l-2 border-amber-400 pl-3">
      <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="revision" value={revision} />
      <p className="text-sm">Withdraw this entire request? The producer will no longer be able to accept it. Its history will remain available.</p>
      <div className="flex flex-wrap gap-2"><button disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white disabled:opacity-50">{pending && <LoaderCircle size={15} className="animate-spin" />}{pending ? "Withdrawing..." : "Confirm withdrawal"}</button><button type="button" disabled={pending} onClick={() => setConfirming(false)} className="h-9 px-3 text-sm font-semibold">Keep request</button></div>
    </form>}
    {state.message && <p role="alert" className="text-sm text-rose-700">{state.message}</p>}
  </div>;
}
