import { HelpLink } from "@/components/help/help-link";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";

const progressDescriptions: Record<string, string> = {
  draft: "Review the event details and schedule before opening competition.",
  scheduled: "The event is scheduled. Prepare entries and the draw before competition starts.",
  entries_open: "The event is in its entry stage. Public visibility and entry dates also control online requests.",
  entries_closed: "The entry stage is closed. Review the draw before competition starts.",
  in_progress: "Competition is underway. Use the event desk to manage draws and record runs.",
  completed: "Competition is complete. Review results and finish financial closeout.",
  cancelled: "This event is cancelled. Online entries are unavailable.",
};

export function EventStatusOverview({ status, publicationState, resultStatus, visibilityControl, resultsControl }: {
  status: string;
  publicationState: "draft" | "published" | "unpublished";
  resultStatus: string;
  visibilityControl?: ReactNode;
  resultsControl?: ReactNode;
}) {
  const official = resultStatus === "official";
  return <section aria-label="Event status and visibility" className="grid gap-3 lg:grid-cols-3">
    <div className="space-y-3 rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Event progress</h2><StatusPill status={status} /></div>
      <p className="text-sm leading-6 text-[#526059]">{progressDescriptions[status] ?? "Review the event's current competition stage."}</p>
    </div>
    <div className="space-y-3 rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Public visibility</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${publicationState === "published" ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>{publicationState === "published" ? "Published" : publicationState === "draft" ? "Draft · Hidden" : "Unpublished · Hidden"}</span></div>
      <p className="text-sm leading-6 text-[#526059]">{publicationState === "published" ? "The event, draw, and recorded results are visible on your public page. Results may still be unofficial." : "The event, draw, and results are hidden from your public page. Staff can continue working."}</p>
      {visibilityControl}
      <HelpLink guide="publishing" label="Visibility & results guide" />
    </div>
    <div className="space-y-3 rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Results</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${official ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{official ? "Official" : "Unofficial"}</span></div>
      <p className="text-sm leading-6 text-[#526059]">{official ? "Results have been finalized. Public visibility still controls whether the public can see them." : "Results are provisional. Marking them official completes the event; it does not change public visibility."}</p>
      {resultsControl}
    </div>
  </section>;
}
