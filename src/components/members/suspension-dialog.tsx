"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, X } from "lucide-react";
import { saveMembershipSuspension } from "@/app/(app)/members/[membershipId]/suspension-actions";
import type { MembershipSuspension } from "@/lib/membership-suspensions";

export function SuspensionDialog({ membershipId, suspension, today, onClose }: {
  membershipId: string; suspension: MembershipSuspension | null; today: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [start, setStart] = useState(today);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function submit(form: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const result = await saveMembershipSuspension(membershipId, suspension?.id ?? null, reference, form);
        if (result.error) setError(result.error); else onClose();
      } catch { setError("Unable to save this change. Please try again."); }
    });
  }
  return <dialog ref={dialog} aria-labelledby="suspension-title"
    onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40">
    <header className="flex items-center justify-between gap-3 border-b border-[#dfe4e1] p-5">
      <h2 id="suspension-title" className="text-lg font-bold">{suspension ? "Lift suspension" : "Suspend membership"}</h2>
      <button type="button" disabled={pending} onClick={onClose} aria-label="Close" title="Close" className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#eef1ef]"><X size={20} /></button>
    </header>
    <PersistentForm action={submit} className="space-y-5 p-5">
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {!suspension ? <div className="flex flex-wrap gap-4">
          <label className="grid max-w-full shrink-0 gap-2 text-sm font-semibold">Starts on<input autoFocus type="date" name="startsOn" value={start} onChange={(event) => setStart(event.target.value)} required className="h-10 w-44 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm" /></label>
          <label className="grid max-w-full shrink-0 gap-2 text-sm font-semibold">Ends on<input type="date" name="endsOn" min={start} required className="h-10 w-44 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm" /></label>
        </div> : null}
        <label className="flex min-w-0 flex-col items-start gap-2 text-sm font-semibold">{suspension ? "Reason for lifting suspension" : "Reason for suspension"}<textarea autoFocus={!!suspension} name="reason" required minLength={5} maxLength={2000} rows={4} className="w-96 min-w-0 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm" /></label>
      </fieldset>
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <footer className="flex justify-end gap-2 border-t border-[#dfe4e1] pt-4">
        <button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button>
        <button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Saving..." : suspension ? "Lift suspension" : "Suspend"}</button>
      </footer>
    </PersistentForm>
  </dialog>;
}
