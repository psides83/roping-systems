"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleCard({
  summary,
  actions,
  children,
  defaultOpen = false,
}: {
  summary: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <article className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <header className="flex flex-col gap-3 border-b border-[#e7ebe8] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">{summary}</div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
          {actions}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={contentId}
            aria-label={open ? "Collapse schedule" : "Expand schedule"}
            title={open ? "Collapse schedule" : "Expand schedule"}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] text-[#66716b] hover:bg-[#f7f8f7]"
          >
            <ChevronDown
              size={17}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </header>
      {open ? <div id={contentId}>{children}</div> : null}
    </article>
  );
}
