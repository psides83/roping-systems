"use client";
import { useActionState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import { startEventDesk, type LiveRunState } from "@/app/(app)/events/[eventId]/actions";
import { EventOfficialResultsControl } from "./event-official-results-control";

export function EventLifecycleControl({ eventId, status, resultStatus, enabled }: { eventId: string; status: string; resultStatus: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<LiveRunState, FormData>(startEventDesk.bind(null, eventId), {});
  if (["in_progress", "completed"].includes(status)) return <EventOfficialResultsControl eventId={eventId} status={status} resultStatus={resultStatus} enabled={enabled} />;
  if (!enabled || status === "cancelled") return null;
  return <form action={action} aria-busy={pending}>
    <button disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}{pending ? "Starting event..." : "Start event"}</button>
    {state.message && <p role={state.success ? "status" : "alert"} className={`mt-2 max-w-sm text-sm ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
  </form>;
}
