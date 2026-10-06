"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Tags } from "lucide-react";
import { acknowledgeWatch } from "@/app/(app)/settings/classification-watch/actions";
import { groupWatchFlags, watchMoveOptions, type RunFlag, type WatchClassificationChoice, type WatchCurrentAssignment } from "@/lib/classification-watch";
import { ClassificationWatchMoveDialog } from "./classification-watch-move-dialog";

export function ClassificationWatchList({ flags, canEdit, compact = false, eventId, classificationNames = {}, classifications = [], assignments = [], today = "" }: {
  flags: RunFlag[]; canEdit: boolean; compact?: boolean; eventId?: string; classificationNames?: Record<string, string>;
  classifications?: WatchClassificationChoice[]; assignments?: WatchCurrentAssignment[]; today?: string;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState<{ runs: RunFlag[]; current: WatchCurrentAssignment; choices: WatchClassificationChoice[]; currentName: string } | null>(null);
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => clearInterval(interval);
  }, [router]);
  const groups = groupWatchFlags(flags).filter((group) => !eventId || group.runs.some((run) => run.event_id === eventId));
  if (compact && !groups.length) return null;
  return <section className="border-y border-[#dfe4e1] bg-white">
    <header className="flex items-center gap-2 px-5 py-4"><AlertTriangle size={18} className="text-amber-700" /><h2 className="font-bold">Classification watch</h2><span className="text-sm text-[#66716b]">{groups.length} flagged</span></header>
    {!groups.length ? <p className="px-5 pb-5 text-sm text-[#758078]">No runs awaiting staff review</p> : null}
    <div className="divide-y divide-[#e7ebe8]">{groups.map(({ runs, reviewDue }) => {
      const first = runs[0];
      const roper = first.memberships.ropers;
      const options = watchMoveOptions(first, classifications, assignments);
      return <details key={`${first.membership_id}:${first.assignment_id}:${first.rule_id}`} className="group px-5 py-4">
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm"><span className="font-semibold">{roper.first_name} {roper.last_name}</span>
          <span className={`rounded px-2 py-1 text-xs font-semibold ${reviewDue ? "bg-amber-100 text-amber-900" : "bg-[#eef1ef] text-[#66716b]"}`}>{reviewDue ? "Review due" : "Watch"} · {runs.length}/{first.rule_snapshot.review_count} runs</span>
          <span className="text-[#66716b]">{first.rule_snapshot.name}</span>
        </summary>
        <div className="disclosure-content mt-4 space-y-3">
          {first.rule_snapshot.proposed_classification_id ? <p className="text-sm text-[#66716b]">Suggested classification: <strong>{classificationNames[first.rule_snapshot.proposed_classification_id] ?? "Staff review"}</strong></p> : null}
          <Link href={`/members/${first.membership_id}`} className="text-sm font-semibold underline underline-offset-4">Member record & classification history</Link>
          <ul className="space-y-2 text-sm">{runs.map((flag) => <li key={flag.id} className="flex flex-wrap gap-x-4 gap-y-1"><Link href={`/events/${flag.event_id}/live?division=${flag.event_roping_id}&round=${flag.round_number}`} className="underline underline-offset-4">{flag.event_ropings.name} · Round {flag.round_number}</Link>
            <span className="font-mono font-semibold">{Number(flag.measured_seconds).toFixed(2)} sec</span><span className="text-[#66716b]">{flag.occurred_on} · {flag.rule_snapshot.inclusive ? "≤" : "<"} {Number(flag.rule_snapshot.threshold_seconds).toFixed(2)} sec</span></li>)}</ul>
          {canEdit ? <div className="flex flex-wrap items-end gap-4">
            <button disabled={!options.canApprove} title={options.canApprove ? "Approve a classification change" : "Current classification or active target classifications are unavailable"}
              onClick={() => { if (options.current && options.canApprove) setMoving({ runs, current: options.current, choices: options.choices, currentName: classificationNames[options.current.classification_id] ?? "Current classification" }); }} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-3 text-sm font-semibold text-white disabled:opacity-50"><Tags size={15} />Approve & move</button>
            <ReviewForm membershipId={first.membership_id} divisionId={first.division_id} />
            {options.current && options.current.id !== first.assignment_id ? <p className="basis-full text-xs text-[#66716b]">This member’s classification has already changed. These runs can still be reviewed without another move.</p> : null}
          </div> : null}
        </div>
      </details>;
    })}</div>
    {!compact && flags.some((f) => f.reviewed_at || !f.is_active) ? <details className="border-t px-5 py-4"><summary className="cursor-pointer text-sm font-semibold">Reviewed & corrected run history</summary>
      <ul className="mt-3 space-y-3 text-sm">{flags.filter((f) => f.reviewed_at || !f.is_active).map((f) => <li key={f.id}><Link href={`/members/${f.membership_id}`} className="font-semibold underline underline-offset-4">{f.memberships.ropers.first_name} {f.memberships.ropers.last_name}</Link> · {f.event_ropings.name} · Round {f.round_number} · {Number(f.measured_seconds).toFixed(2)} sec
        {f.review ? <p className="mt-1 text-xs font-semibold">Approved: {classificationNames[f.review.current_classification_id ?? ""] ?? "Previous classification"} → {classificationNames[f.review.proposed_classification_id ?? ""] ?? "New classification"} · Effective {f.review.review_on} · {f.review.decision_staff_label ?? "Staff"}</p> : null}
        <p className="mt-1 text-xs text-[#66716b]">{f.review_reason ?? f.cleared_reason}</p></li>)}</ul>
    </details> : null}
    {moving ? <ClassificationWatchMoveDialog flags={moving.runs} choices={moving.choices} current={moving.current}
      currentName={moving.currentName} today={today} onClose={() => { setMoving(null); router.refresh(); }} /> : null}
  </section>;
}

function ReviewForm({ membershipId, divisionId }: { membershipId: string; divisionId: string }) {
  const [state, action, pending] = useActionState(acknowledgeWatch, {});
  return <form action={action} className="flex flex-wrap items-end gap-3">
    <input name="membershipId" type="hidden" value={membershipId} /><input name="divisionId" type="hidden" value={divisionId} />
    <label className="text-xs font-semibold">Staff decision<input name="reason" required minLength={5} maxLength={2000} placeholder="Decision and reason" className="mt-1 block h-10 w-72 max-w-full rounded-md border px-3 text-sm font-normal" /></label>
    <button disabled={pending} className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><Check size={15} />{pending ? "Saving…" : "Mark reviewed"}</button>
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
  </form>;
}
