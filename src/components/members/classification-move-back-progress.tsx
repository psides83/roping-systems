"use client";

import { useActionState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import { approveMoveBackException } from "@/app/(app)/settings/classification-watch/move-back-actions";
import { moveBackStatus, type MoveBackProgress } from "@/lib/classification-move-back";

export function ClassificationMoveBackProgress({ membershipId, progress, canEdit }: { membershipId: string; progress: MoveBackProgress[]; canEdit: boolean }) {
  const enabled = progress.filter((p) => p.enabled);
  if (!enabled.length) return null;
  return <section className="border-y border-[#dfe4e1] bg-white">
    <header className="flex items-center gap-2 px-5 py-4"><ClipboardCheck size={18} /><h2 className="font-bold">Move-back eligibility</h2></header>
    <div className="divide-y divide-[#e7ebe8]">{enabled.map((p) => <div key={p.assignmentId} className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold">{p.divisionName} · {p.classificationName}</p>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${p.eligible ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{moveBackStatus(p)}</span></div>
      {p.hasMove ? <><p className="text-sm text-[#66716b]">{p.completedRopings} of {p.requiredRopings} required ropings competed in since the move from {p.previousClassificationName}.</p>
        {p.exceptionReason ? <p className="text-xs text-[#66716b]">Exception approved by {p.exceptionStaff}: {p.exceptionReason}</p> : null}
        {canEdit && !p.eligible ? <details><summary className="cursor-pointer text-sm font-semibold">Approve a staff exception</summary><ExceptionForm membershipId={membershipId} assignmentId={p.assignmentId} /></details> : null}
      </> : <p className="text-sm text-[#66716b]">No previous classification move requiring participation.</p>}
    </div>)}</div>
  </section>;
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
