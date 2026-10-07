"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { refreshRopingQualification } from "@/app/(app)/events/[eventId]/qualification-actions";

export function QualificationRefreshButton({ ropingId }: { ropingId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  return <div>
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      setMessage("");
      try {
        const result = await refreshRopingQualification(ropingId);
        setFailed(!!result.error);
        setMessage(result.error ?? "Qualification check refreshed.");
      } catch { setFailed(true); setMessage("Unable to refresh qualification. Please try again."); }
    })} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-60">
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
      {pending ? "Refreshing qualification..." : "Refresh check"}
    </button>
    {message && <p role={failed ? "alert" : "status"} className={`mt-2 max-w-md text-xs ${failed ? "text-rose-700" : "text-emerald-700"}`}>{message}</p>}
  </div>;
}
