"use client";

import { useActionState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { approveMoveBackException } from "@/app/(app)/settings/classification-watch/move-back-actions";
import { moveBackStatus, type MoveBackProgress, type MoveBackException } from "@/lib/classification-move-back";

export function ClassificationMoveBackProgress({ membershipId, progress, exceptions = [], canEdit, timezone = "UTC" }: { membershipId: string; progress: MoveBackProgress[]; exceptions?: MoveBackException[]; canEdit: boolean; timezone?: string }) {
  const enabled = progress.filter((p) => p.enabled);
  if (!enabled.length && !exceptions.length) return null;
  return <section id="move-back-eligibility" className="scroll-mt-6 border-y border-[#dfe4e1] bg-white">
    <header className="flex items-center gap-2 px-5 py-4"><ClipboardCheck size={18} /><h2 className="font-bold">Move-back eligibility</h2></header>
    <div className="divide-y divide-[#e7ebe8]">{enabled.map((p) => <div key={p.assignmentId} className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold">{p.divisionName} · {p.classificationName}</p>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${p.eligible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{moveBackStatus(p)}</span></div>
      {p.hasMove ? <><p className="text-sm text-[#66716b]">{p.completedRopings} of {p.requiredRopings} required ropings competed in since the move from {p.previousClassificationName}.</p>
        {p.exceptionReason ? <p className="text-xs text-[#66716b]">Exception approved by {p.exceptionStaff}: {p.exceptionReason}</p> : null}
        <details><summary className="cursor-pointer text-sm font-semibold">Counted ropings · {p.completedRopings}</summary>
          {p.participation?.length ? <ul className="mt-3 divide-y divide-[#e7ebe8]">{p.participation.map((roping) => <li key={roping.ropingId} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
            <div className="min-w-0"><Link href={`/events/${roping.eventId}/live?division=${roping.ropingId}`} className="font-semibold underline underline-offset-2">{roping.name}</Link><p className="mt-1 text-xs text-[#66716b]">{roping.eventTitle} · {displayDate(roping.date)}</p></div>
            <p className="text-xs text-[#66716b]">{roping.qualifiedRuns} qualified{roping.noTimeRuns ? ` · ${roping.noTimeRuns} no time` : ""}{roping.disqualifiedRuns ? ` · ${roping.disqualifiedRuns} disqualified` : ""}</p>
          </li>)}</ul> : <p className="mt-3 text-sm text-[#66716b]">No qualifying participation since this move.</p>}
        </details>
        {canEdit && !p.eligible ? <details><summary className="cursor-pointer text-sm font-semibold">Approve a staff exception</summary><ExceptionForm membershipId={membershipId} assignmentId={p.assignmentId} /></details> : null}
      </> : <p className="text-sm text-[#66716b]">No previous classification move requiring participation.</p>}
    </div>)}</div>
    {exceptions.length ? <details className="border-t border-[#e7ebe8] px-5 py-4"><summary className="cursor-pointer text-sm font-semibold">Staff exception history · {exceptions.length}</summary><ul className="mt-3 divide-y divide-[#e7ebe8]">{exceptions.map((exception) => <li key={exception.id} className="space-y-1 py-3 text-sm">
      <p className="font-semibold">{exception.divisionName} · {exception.classificationName}</p>
      <p>{exception.reason}</p><p className="text-xs text-[#66716b]">Approved by {exception.staffLabel} · <time dateTime={exception.approvedAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(exception.approvedAt))}</time></p>
      <p className="text-xs text-[#66716b]">{exception.completedRopings} of {exception.requiredRopings} required ropings at approval · Move effective {displayDate(exception.effectiveOn)}</p>
    </li>)}</ul></details> : null}
  </section>;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function ExceptionForm({ membershipId, assignmentId }: { membershipId: string; assignmentId: string }) {
  const [state, action, pending] = useActionState(approveMoveBackException, {});
  return <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
    <input name="membershipId" type="hidden" value={membershipId} /><input name="assignmentId" type="hidden" value={assignmentId} />
    <label className="grid min-w-0 max-w-full gap-1 text-xs font-semibold">Reason for the exception<textarea name="reason" required minLength={5} maxLength={2000} rows={2} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm font-normal" /></label>
    <button disabled={pending} className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold disabled:opacity-50"><Check size={15} />{pending ? "Saving..." : "Approve exception"}</button>
    {state.error ? <p role="alert" className="basis-full text-sm text-red-700">{state.error}</p> : null}
  </form>;
}
