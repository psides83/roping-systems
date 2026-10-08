"use client";

import { useActionState } from "react";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { markEventResultsOfficial, type OfficialResultState } from "@/app/(app)/events/[eventId]/result-actions";

export function EventOfficialResultsControl({ eventId, status, resultStatus, enabled }: {
  eventId: string; status: string; resultStatus: string; enabled: boolean;
}) {
  const [state, action, pending] = useActionState(markEventResultsOfficial.bind(null, eventId), {} as OfficialResultState);
  if (resultStatus === "official") return <span className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCheck size={15} /> Official results</span>;
  if (!enabled || !["in_progress", "completed"].includes(status)) return null;
  return <form action={action} aria-busy={pending} onSubmit={(event) => {
    if (!window.confirm("Mark all results for this event official? This completes the event. Every run and configured short round must be resolved first.")) event.preventDefault();
  }}>
    <button disabled={pending} className="flex min-h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold disabled:opacity-50">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCheck size={15} />} {pending ? "Publishing official results..." : "Mark results official"}</button>
    {state.message ? <p role={state.success ? "status" : "alert"} className={`mt-2 max-w-sm text-xs ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
  </form>;
}
