"use client";

import { useEffect, useRef } from "react";
import { useNavigationGuard } from "nextjs-nav-guard";

export function UnsavedChangesGuard({ dirty, saving = false, onSave }: { dirty: boolean; saving?: boolean; onSave?: () => void }) {
  const guard = useNavigationGuard({ enabled: dirty });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (guard.active && element && !element.open) element.showModal();
    if (!guard.active && element?.open) element.close();
  }, [guard.active]);
  useEffect(() => {
    if (!guard.active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [guard.active]);
  useEffect(() => {
    if (!dirty) return;
    // Account actions redirect through server forms, outside client router guards.
    const confirmSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || (form.target && form.target !== "_self")) return;
      if (saving || !window.confirm("You have unsaved changes. Leave without saving?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("submit", confirmSubmit, true);
    return () => document.removeEventListener("submit", confirmSubmit, true);
  }, [dirty, saving]);
  const button = "inline-flex min-h-11 items-center justify-center rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold disabled:opacity-40";
  return <dialog ref={dialog} aria-labelledby="unsaved-changes-title" aria-describedby="unsaved-changes-description"
    onCancel={(event) => { event.preventDefault(); guard.reject(); }}
    className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-md border border-[#d7ddda] bg-white p-5 text-[#17201c] shadow-xl backdrop:bg-black/45">
    <h2 id="unsaved-changes-title" className="text-lg font-bold">Leave without saving?</h2>
    <p id="unsaved-changes-description" className="mt-3 text-sm leading-6 text-[#66716b]">{saving ? "Your draft is being saved. Please wait before leaving this page." : "You have unsaved changes. Leaving this page will discard them."}</p>
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      <button type="button" autoFocus className={button} onClick={guard.reject}>Keep editing</button>
      {onSave && <button type="button" className={button} disabled={saving} onClick={() => { guard.reject(); onSave(); }}>Save draft and stay</button>}
      <button type="button" className={`${button} border-rose-200 text-rose-800`} disabled={saving} onClick={guard.accept}>Leave without saving</button>
    </div>
  </dialog>;
}
