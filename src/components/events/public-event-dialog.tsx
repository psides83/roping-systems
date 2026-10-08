"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function PublicEventDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} aria-label={`${title} event details`} onClose={onClose}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
    }}
    className="m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-md border border-[#d7ddda] bg-white p-0 text-[#17201c] shadow-xl backdrop:bg-black/45">
    <header className="flex items-center justify-between gap-3 border-b border-[#d7ddda] px-4 py-3 sm:px-6">
      <h2 className="text-lg font-bold">Event details</h2>
      <button type="button" aria-label="Close event details" onClick={() => dialog.current?.close()} className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-[#eef1ef]"><X size={20}/></button>
    </header>
    <div className="max-h-[calc(90svh-4.5rem)] overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
  </dialog>;
}
