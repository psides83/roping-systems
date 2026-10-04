"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, RefreshCw, X } from "lucide-react";
import { confirmTemplateUpdate, type TemplateUpdateState } from "@/app/(app)/events/[eventId]/template-actions";
import { reviewLabel, templateReviewRows, type TemplateReview } from "@/lib/events/template-review";

export function TemplateUpdateDialog({ eventId, review, canManage }: { eventId: string; review: TemplateReview; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [state, action, pending] = useActionState<TemplateUpdateState, FormData>(confirmTemplateUpdate.bind(null, eventId, review.ropingId), {});
  useEffect(() => {
    if (!state.success) return;
    const timeout = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timeout);
  }, [state.success]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not([type=hidden]):not(:disabled), [tabindex='0']");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [open, pending]);
  const dismissed = review.dismissed || state.success;
  return <>
    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold ${dismissed ? "text-[#66716b] hover:bg-[#f1f3f2]" : "bg-amber-50 text-amber-800"}`}>
      <RefreshCw size={13} /> {dismissed ? "Review template" : "Template updated"}
    </button>
    {open ? createPortal(<div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-4" onClick={(event) => event.stopPropagation()}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`template-review-${review.ropingId}`}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[#e1e6e3] p-5">
          <div><h2 id={`template-review-${review.ropingId}`} className="text-lg font-bold">Review template changes</h2><p className="mt-1 text-sm text-[#66716b]">{review.templateName}</p></div>
          <button type="button" aria-label="Close template review" disabled={pending} onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-[#f1f3f2]"><X size={18} /></button>
        </header>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="token" value={review.token} />
          <div className="min-h-0 space-y-5 overflow-y-auto p-5">
            {review.changes.map((change) => <section key={change.section}>
              <h3 className="mb-2 text-sm font-bold">{reviewLabel(change.section)}</h3>
              <div className="divide-y divide-[#e7ebe8] sm:hidden">
                {templateReviewRows(change).map((row) => <div key={row.label} className="py-3">
                  <p className="text-xs font-semibold">{row.label}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-[#66716b]">Current roping</dt><dd className="mt-1 break-words">{row.current}</dd></div>
                    <div><dt className="text-[#66716b]">Updated template</dt><dd className="mt-1 font-semibold break-words">{row.template}</dd></div>
                  </dl>
                </div>)}
              </div>
              <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[420px] text-left text-xs">
                <thead className="border-b border-[#dfe4e1] text-[#66716b]"><tr><th className="w-2/5 py-2 pr-3">Setting</th><th className="w-[30%] p-2">Current roping</th><th className="w-[30%] p-2">Updated template</th></tr></thead>
                <tbody className="divide-y divide-[#e7ebe8]">{templateReviewRows(change).map((row) => <tr key={row.label}><th className="py-3 pr-3 font-medium break-words">{row.label}</th><td className="p-2 align-top break-words">{row.current}</td><td className="p-2 align-top font-semibold break-words">{row.template}</td></tr>)}</tbody>
              </table></div>
            </section>)}
            {review.blockedReason ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{review.blockedReason}</p> : review.entryCount > 0 ?
              <label className="flex items-start gap-3 border-t border-[#e1e6e3] pt-4 text-sm"><input type="checkbox" name="confirmEntries" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" /><span>Apply these changes to this roping and its {review.entryCount} existing entries, including affected unpaid charges and purse calculations.</span></label> : null}
            {state.message ? <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{state.message}</p> : null}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e1e6e3] p-4">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-10 rounded-md px-3 text-sm font-semibold">Cancel</button>
            <button name="decision" value="keep" disabled={pending || !canManage} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold disabled:opacity-50">Keep current settings</button>
            <button name="decision" value="update" disabled={pending || !canManage || !!review.blockedReason || (review.entryCount > 0 && !confirmed)} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Update from template</button>
          </footer>
        </form>
      </section>
    </div>, document.body) : null}
  </>;
}
