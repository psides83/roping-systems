"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { HelpLink } from "@/components/help/help-link";

export function PageRecovery({ title, description, retry, returnHref = "/dashboard", returnLabel = "Return to dashboard" }: {
  title: string; description: string; retry: () => void; returnHref?: string; returnLabel?: string;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const [pending, startTransition] = useTransition();
  return <section aria-labelledby="page-recovery-title" className="mx-auto w-full max-w-2xl space-y-5 rounded-lg border border-[#dfe4e1] bg-white p-5 sm:p-7">
    <div className="flex items-start gap-3"><CircleAlert size={24} aria-hidden="true" className="mt-1 shrink-0 text-[#66716b]" /><div><h1 ref={titleRef} tabIndex={-1} id="page-recovery-title" className="text-xl font-bold text-[#17201c]">{title}</h1><p className="mt-2 text-sm leading-6 text-[#526059]">{description}</p></div></div>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={() => { if (!pending) startTransition(async () => { await retry(); }); }} className="inline-flex min-h-11 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}{pending ? "Trying again..." : "Try again"}</button><Link href={returnHref} className="inline-flex min-h-11 items-center rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">{returnLabel}</Link></div>
    <p role="status" aria-live="polite" className="sr-only">{pending ? "Trying to load the screen again." : ""}</p>
    <details className="border-t border-[#e7ebe8] pt-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#526059]">Were you saving something?</summary><p className="mt-2 text-sm leading-6 text-[#526059]">A screen failing to load does not confirm whether a save completed. Reopen the record and check its saved status before repeating a payment, result, or other change.</p></details>
    <HelpLink guide="staff-access" label="Access & troubleshooting guide" />
  </section>;
}
