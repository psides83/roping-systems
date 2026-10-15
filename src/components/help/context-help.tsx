"use client";

import { CircleHelp } from "lucide-react";
import { HelpLink } from "./help-link";

/** Optional explanations expand in place so they work with touch and keyboards. */
export function ContextHelp({ title, children, guide }: { title: string; children: React.ReactNode; guide?: string }) {
  return <details className="rounded-md border border-[#dfe4e1] bg-[#f7f9f8] px-4 text-sm"
    onKeyDown={event => { if (event.key === "Escape" && event.currentTarget.open) { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#526059] focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"><CircleHelp size={17} className="shrink-0" aria-hidden="true" />{title}</summary>
    <div className="space-y-2 pb-3 leading-6 text-[#526059]">{children}{guide && <HelpLink guide={guide} label="Read the full guide" />}</div>
  </details>;
}
