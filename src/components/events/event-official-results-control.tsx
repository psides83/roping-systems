"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useState } from "react";
import { CheckCheck, LoaderCircle, X } from "lucide-react";
import { FinalReadinessCheck } from "./final-readiness-check";
import { markEventResultsOfficial, type OfficialResultState } from "@/app/(app)/events/[eventId]/result-actions";

export function EventOfficialResultsControl({ eventId, status, resultStatus, enabled }: {
  eventId: string; status: string; resultStatus: string; enabled: boolean;
}) {
  const [state, action, pending] = useActionState(markEventResultsOfficial.bind(null, eventId), {} as OfficialResultState);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  if (resultStatus === "official") return <span className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCheck size={15} /> Official results</span>;
  if (!enabled || !["in_progress", "completed"].includes(status)) return null;
  return <>
    <button type="button" onClick={() => { setReady(false); setOpen(true); }} className="flex min-h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold"><CheckCheck size={15} />Mark results official</button>
    {open ? <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/45 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby={`official-title-${eventId}`} className="relative my-8 w-full max-w-lg rounded-md bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 id={`official-title-${eventId}`} className="font-bold">Publish official results?</h2><button type="button" aria-label="Close" disabled={pending} onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center"><X size={18} /></button></div>
        <p className="my-3 text-sm text-[#66716b]">This completes the event and marks every roping&apos;s results official.</p>
        <FinalReadinessCheck eventId={eventId} onReady={setReady} />
        <PersistentForm action={action} aria-busy={pending} className="mt-4">
          {state.message ? <p role={state.success ? "status" : "alert"} className="mb-3 text-sm text-rose-700">{state.message}</p> : null}
          <div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-10 rounded-md border px-4 text-sm font-semibold">Cancel</button><button disabled={pending || !ready} className="flex min-h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCheck size={16} />}{pending ? "Publishing..." : "Publish official results"}</button></div>
        </PersistentForm>
      </section>
    </div> : null}
  </>;
}
