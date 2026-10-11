"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, LoaderCircle, RefreshCw, X } from "lucide-react";
import { getSetupReadiness } from "@/app/(app)/events/[eventId]/setup-readiness-actions";
import type { SetupIssue } from "@/lib/events/setup-readiness";

export function SetupReadinessForm({ eventId, mode, action, children, pending, success, message, className }: {
  eventId: string; mode: "publish" | "start" | null; action: (data: FormData) => void;
  children: ReactNode; pending: boolean; success?: boolean; message?: string; className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const approved = useRef(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ issues?: SetupIssue[]; message?: string }>({});
  const [checking, check] = useTransition();
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    if (wasPending && success) setOpen(false);
  }
  function refresh() {
    setResult({});
    check(async () => setResult(await getSetupReadiness(eventId, mode ?? "publish")));
  }
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setOpen(false);
      if (event.key === "Tab") {
        const controls = Array.from(close.current?.closest("section")?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]") ?? []);
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [open, pending]);
  const blocked = !result.issues || result.issues.some((issue) => issue.severity === "blocker");
  return <>
    <PersistentForm ref={form} action={action} className={className} aria-busy={pending} onSubmit={(event) => {
      if (!mode || approved.current) { approved.current = false; return; }
      event.preventDefault(); setOpen(true); refresh();
    }}>{children}</PersistentForm>
    {open ? <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/45 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby={`setup-review-${mode}`} className="my-6 w-full max-w-xl rounded-md bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3"><h2 id={`setup-review-${mode}`} className="text-lg font-bold">{mode === "start" ? "Start event review" : "Publish event review"}</h2><button ref={close} type="button" disabled={pending} onClick={() => setOpen(false)} aria-label="Close review" className="grid h-10 w-10 shrink-0 place-items-center"><X size={20} /></button></div>
        <div className="my-4 flex items-center justify-between gap-2"><p className="text-sm text-[#66716b]">{mode === "start" ? "Check the setup before opening competition." : "Check the schedule before making it public."}</p><button type="button" onClick={refresh} disabled={checking || pending} aria-label="Refresh setup review" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border"><RefreshCw size={17} /></button></div>
        {checking ? <p role="status" className="flex items-center gap-3 rounded-md bg-gray-50 p-6 font-semibold"><LoaderCircle className="animate-spin" />Checking schedules, payouts and templates...</p> : result.message ? <p role="alert" className="text-rose-700">{result.message}</p> : result.issues ? <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {!result.issues.length ? <p className="flex items-center gap-2 py-4 font-semibold text-emerald-700"><CheckCircle2 size={20} />Setup checks passed</p> : (["blocker", "warning"] as const).map((severity) => {
            const issues = result.issues!.filter((issue) => issue.severity === severity);
            return issues.length ? <div key={severity}><h3 className={`mb-2 text-sm font-bold ${severity === "blocker" ? "text-rose-700" : "text-amber-800"}`}>{severity === "blocker" ? "Needs attention" : "Review recommended"} · {issues.length}</h3><ul className="space-y-3 text-sm">{issues.map((issue, index) => <li key={index}>{issue.message} <Link href={issue.href} onClick={() => setOpen(false)} className="font-semibold underline">Review setup</Link></li>)}</ul></div> : null;
          })}
        </div> : null}
        <p className="mt-4 text-xs text-[#66716b]">Warnings do not block continuing. Exact arena start-time collisions are checked; estimated durations are not assumed.</p>
        {message && !success ? <p role="alert" className="mt-3 text-sm text-rose-700">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-10 rounded-md border px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={checking || pending || blocked} onClick={() => { approved.current = true; form.current?.requestSubmit(); }} className="flex min-h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{mode === "start" ? "Start event" : "Publish event"}</button></div>
      </section>
    </div> : null}
  </>;
}
