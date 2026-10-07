"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";

export function MobileActionMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !root.current?.querySelector('[role="dialog"]')) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !root.current?.querySelector('[role="dialog"]')) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={root} className="relative order-2 shrink-0 sm:order-none">
    <button ref={trigger} type="button" aria-label="More event actions" title="More event actions" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)} className="grid h-11 w-11 place-items-center rounded-md border border-[#d7ddda] bg-white sm:hidden">
      <Ellipsis size={20} />
    </button>
    <div id={id} onClick={(event) => { if ((event.target as HTMLElement).closest("a,[data-close-mobile-menu]")) setOpen(false); }}
      className={`${open ? "flex" : "hidden"} absolute right-0 top-12 z-40 min-w-52 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-md border border-[#d7ddda] bg-white p-2 shadow-lg sm:static sm:flex sm:min-w-0 sm:max-w-none sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none [&>a]:h-11 [&>a]:w-full [&>a]:justify-start [&>a]:whitespace-nowrap [&>button]:h-11 [&>button]:w-full [&>button]:whitespace-nowrap sm:[&>a]:h-10 sm:[&>a]:w-auto sm:[&>button]:h-10 sm:[&>button]:w-auto`}>
      {children}
    </div>
  </div>;
}
