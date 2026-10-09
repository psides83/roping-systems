"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

export function SetupRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())} className="inline-flex min-h-10 min-w-40 items-center justify-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}{pending ? "Refreshing..." : "Refresh checklist"}</button>
    {pending ? <span role="status" className="text-xs font-semibold text-[#66716b]">Checking saved settings...</span> : null}
  </div>;
}
