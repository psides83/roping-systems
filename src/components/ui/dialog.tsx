"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal behavior keeps focus and background interaction in one place. */
export function Dialog({ title, description, onClose, busy = false, children }: {
  title: string; description: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dirty = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.body.style.overflow;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    return () => { dialog.close(); document.body.style.overflow = previous; queueMicrotask(() => { if (trigger?.isConnected) trigger.focus(); }); };
  }, []);
  function close() {
    if (busy) return;
    if (dirty.current && !window.confirm("Discard unsaved changes? Your edits in this dialog will be lost.")) return;
    onClose();
  }
  return <dialog ref={ref} role="dialog" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}
    onChangeCapture={() => { dirty.current = true; }}
    onClickCapture={event => {
      if ((event.target as HTMLElement).closest("[data-dialog-close]")) { event.preventDefault(); event.stopPropagation(); close(); }
    }}
    className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#17201c] shadow-2xl backdrop:bg-black/45">
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e1e6e3] bg-white p-5">
      <div><h2 id={titleId} className="text-lg font-bold">{title}</h2><p id={descriptionId} className="mt-1 text-sm leading-6 text-[#66716b]">{description}</p></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-[#f0f2f1] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"><X size={18} /></button>
    </header>
    {children}
  </dialog>;
}
