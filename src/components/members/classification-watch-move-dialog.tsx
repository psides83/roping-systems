"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { approveWatchMove } from "@/app/(app)/settings/classification-watch/approval-actions";
import type { RunFlag, WatchClassificationChoice, WatchCurrentAssignment } from "@/lib/classification-watch";
import { loadMoveBackDetails } from "@/app/(app)/settings/classification-watch/move-back-actions";
import { blocksMoveBack, type MoveBackProgress } from "@/lib/classification-move-back";
import { MoveBackFeedback } from "./move-back-feedback";
import { FinalsMoveDecision } from "./finals-move-decision";

export function ClassificationWatchMoveDialog({ flags, choices, current, currentName, today, onClose }: {
  flags: RunFlag[]; choices: WatchClassificationChoice[]; current: WatchCurrentAssignment;
  currentName: string; today: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reference] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const suggested = flags[0].rule_snapshot.proposed_classification_id;
  const initialClass = choices.some((c) => c.id === suggested) ? suggested! : "";
  const [classificationId, setClassificationId] = useState(initialClass);
  const [eligibility, setEligibility] = useState<{ loading: boolean; progress?: MoveBackProgress; error?: string }>({ loading: true });
  const [checkAttempt, setCheckAttempt] = useState(0);
  const blocked = blocksMoveBack(eligibility.progress, classificationId);
  const minimumDate = flags.reduce((latest, flag) => flag.occurred_on > latest ? flag.occurred_on : latest, current.effective_on);
  const roper = flags[0].memberships.ropers;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let cancelled = false;
    loadMoveBackDetails(current.membership_id).then((result) => {
      const progress = result.details?.progress.find((p) => p.divisionId === current.division_id);
      const error = result.error || (result.details && progress?.assignmentId !== current.id
        ? "The member's classification has changed. Close this dialog and refresh before approving a move." : undefined);
      if (!cancelled) setEligibility({ loading: false, progress, error });
    }).catch(() => {
      if (!cancelled) setEligibility({ loading: false, error: "Unable to check move-back eligibility. Please try again." });
    });
    return () => { cancelled = true; };
  }, [current.membership_id, current.division_id, current.id, checkAttempt]);
  function submit(form: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await approveWatchMove(form);
        if (result.error) setError(result.error); else onClose();
      } catch { setError("Unable to save the classification change. Please try again."); }
    });
  }
  return <dialog ref={dialog} aria-labelledby={titleId}
    onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40">
    <header className="flex items-start justify-between gap-3 border-b border-[#dfe4e1] p-5">
      <div><h2 id={titleId} className="text-lg font-bold">Approve classification move</h2><p className="mt-1 text-sm text-[#66716b]">{roper.first_name} {roper.last_name}</p></div>
      <button type="button" disabled={pending} onClick={onClose} aria-label="Close" title="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-[#eef1ef]"><X size={20} /></button>
    </header>
    <form action={submit} className="space-y-5 p-5">
      <input name="membershipId" type="hidden" value={current.membership_id} /><input name="divisionId" type="hidden" value={current.division_id} />
      <input name="assignmentId" type="hidden" value={current.id} /><input name="reference" type="hidden" value={reference} />
      {flags.map((f) => <input key={f.id} name="flagId" type="hidden" value={f.id} />)}
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div><p className="text-xs font-semibold text-[#66716b]">Current classification</p><p className="mt-2 flex h-10 items-center gap-3 font-semibold">{currentName}<ArrowRight size={16} /></p></div>
          <label className="grid min-w-0 max-w-full gap-2 text-sm font-semibold">New classification<select autoFocus name="classificationId" value={classificationId} onChange={(e) => setClassificationId(e.target.value)} required className="h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="">Choose a classification</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="grid max-w-full gap-2 text-sm font-semibold">Effective date<input name="effectiveOn" type="date" min={minimumDate} defaultValue={today > minimumDate ? today : minimumDate} required className="h-10 w-44 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm" /></label>
        </div>
        {eligibility.loading ? <p role="status" className="flex items-center gap-2 rounded-md bg-[#f0f2f1] p-3 text-sm"><LoaderCircle size={16} className="animate-spin" />Checking classification eligibility...</p> : eligibility.error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><p>{eligibility.error}</p><button type="button" onClick={() => { setEligibility({ loading: true }); setCheckAttempt((n) => n + 1); }} className="mt-2 font-semibold underline">Try again</button></div> : <MoveBackFeedback progress={eligibility.progress} targetId={classificationId} memberId={current.membership_id} onNavigate={onClose} />}
        <label className="flex min-w-0 flex-col items-start gap-2 text-sm font-semibold">Reason for the move<textarea name="reason" required minLength={5} maxLength={2000} rows={3} className="w-96 min-w-0 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm" /></label>
        <FinalsMoveDecision />
        <details className="border-y border-[#e7ebe8] py-3"><summary className="cursor-pointer text-sm font-semibold">Run evidence · {flags.length} runs</summary><ul className="mt-3 space-y-2 text-xs text-[#66716b]">{flags.map((f) => <li key={f.id} className="flex flex-wrap justify-between gap-2"><span>{f.event_ropings.name} · Round {f.round_number} · {f.occurred_on}</span><strong className="font-mono">{Number(f.measured_seconds).toFixed(2)} sec</strong></li>)}</ul></details>
      </fieldset>
      <p className="text-xs leading-5 text-[#66716b]">Existing entries and scored runs stay unchanged. The move, staff decision, and selected run evidence are retained in classification history.</p>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-[#dfe4e1] pt-4">
        <button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button>
        <button disabled={pending || !classificationId || eligibility.loading || Boolean(eligibility.error) || blocked} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{pending ? "Saving..." : "Approve & move"}</button>
      </footer>
    </form>
  </dialog>;
}
