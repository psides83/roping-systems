"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

export function NavigationPending({ label = "Loading page", className = "" }: { label?: string; className?: string }) {
  const { pending } = useLinkStatus();
  return <span role="status" aria-live="polite" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}>
    {pending ? <><span className="sr-only">{label}</span><LoaderCircle size={14} aria-hidden="true" className="navigation-pending" /></> : null}
  </span>;
}
