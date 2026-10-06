import { blocksMoveBack, type MoveBackProgress } from "@/lib/classification-move-back";

export function MoveBackFeedback({ progress, targetId, memberId, onNavigate }: {
  progress?: MoveBackProgress; targetId: string; memberId: string; onNavigate?: () => void;
}) {
  if (!progress?.enabled || !progress.hasMove || !targetId || targetId === progress.classificationId) return null;
  const blocked = blocksMoveBack(progress, targetId);
  if (!blocked && !progress.moveBackTargetIds?.includes(targetId)) return null;
  return <div role="status" className={`rounded-md border p-3 text-sm leading-5 ${blocked ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
    <p className="font-semibold">{blocked ? "Move-back requirement not met" : progress.exceptionReason ? "Staff exception approved" : "Eligible for move-back review"}</p>
    <p className="mt-1">{progress.completedRopings} of {progress.requiredRopings} required ropings competed in since this move.</p>
    {blocked ? <a href={`/members/${memberId}#move-back-eligibility`} onClick={onNavigate} className="mt-2 inline-block font-semibold underline">Review participation or approve an exception</a> : null}
  </div>;
}
