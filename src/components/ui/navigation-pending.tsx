"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { LoadingNotice } from "./loading-notice";

export function NavigationPending({ label = "Loading page", className = "" }: { label?: string; className?: string }) {
  const { pending } = useLinkStatus();
  return <><span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${className}`}>
    {pending ? <LoaderCircle size={16} className="navigation-pending" /> : null}
  </span>{pending && typeof document !== "undefined" ? createPortal(
    <div role="status" aria-live="polite" aria-busy="true" className="pointer-events-none fixed inset-x-4 top-4 z-[120] mx-auto max-w-md">
      <LoadingNotice label={label} compact />
    </div>, document.body) : null}</>;
}
