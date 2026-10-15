"use client";

import { Dialog } from "@/components/ui/dialog";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useState } from "react";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { FinalReadinessCheck } from "./final-readiness-check";
import { markEventResultsOfficial, type OfficialResultState } from "@/app/(app)/events/[eventId]/result-actions";

export function EventOfficialResultsControl({ eventId, status, resultStatus, enabled }: {
  eventId: string; status: string; resultStatus: string; enabled: boolean;
}) {
  const [state, action, pending] = useActionState(markEventResultsOfficial.bind(null, eventId), {} as OfficialResultState);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  if (resultStatus === "official") return <span className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCheck size={15} /> Official results</span>;
  if (!["in_progress", "completed"].includes(status)) return <p className="text-sm text-[#66716b]">Results can be marked official after competition starts.</p>;
  if (!enabled) return <p className="text-sm text-[#66716b]">Event management access is required to finalize results.</p>;
  return <>
    <button type="button" onClick={() => { setReady(false); setOpen(true); }} className="flex min-h-11 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><CheckCheck size={15} />Mark results official</button>
    {open ? <Dialog title="Mark results official?" description="This completes the event and marks every roping’s results official. Public visibility stays as currently saved." busy={pending} onClose={() => setOpen(false)}>
      <div className="p-5">
        <FinalReadinessCheck eventId={eventId} onReady={setReady} />
        <PersistentForm action={action} aria-busy={pending} className="mt-4">
          {state.message ? <p role={state.success ? "status" : "alert"} className="mb-3 text-sm text-rose-700">{state.message}</p> : null}
          <div className="flex justify-end gap-2"><button type="button" disabled={pending} data-dialog-close className="min-h-11 rounded-md border px-4 text-sm font-semibold">Cancel</button><button disabled={pending || !ready} className="flex min-h-11 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCheck size={16} />}{pending ? "Finalizing..." : "Mark results official"}</button></div>
        </PersistentForm>
      </div>
    </Dialog> : null}
  </>;
}
