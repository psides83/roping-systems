"use client";

import { useEffect, useId, useRef } from "react";
import { CircleHelp } from "lucide-react";

export function FinancialLabel({ label, help }: { label: string; help: string }) {
  const id = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: Event) {
      const details = disclosure.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    }
    function closeOnEscape(event: KeyboardEvent) {
      const details = disclosure.current;
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return <span className="relative inline-flex max-w-full items-center gap-1.5">
    <span>{label}</span>
    <details ref={disclosure} className="group shrink-0">
      <summary role="button" title={help} aria-label={`About ${label.toLowerCase()}`} aria-controls={id} className="flex min-h-6 min-w-6 cursor-pointer list-none items-center justify-center rounded-sm text-[#758078] outline-offset-2 [&::-webkit-details-marker]:hidden">
        <CircleHelp size={15} aria-hidden="true" />
      </summary>
      <span id={id} className="absolute left-0 top-full z-30 mt-1 block w-56 max-w-[calc(100vw-3rem)] rounded-md bg-[#17201b] p-3 text-left text-xs font-normal leading-5 text-white shadow-lg">{help}</span>
    </details>
  </span>;
}
