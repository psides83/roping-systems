"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";

export default function PublicPageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { producerSlug } = useParams<{ producerSlug: string }>();
  const [pending, startTransition] = useTransition();
  const base = `/public/${encodeURIComponent(producerSlug)}`;
  return <main className="min-h-screen bg-[#f5f6f7] px-4 py-10">
    <section className="mx-auto max-w-lg space-y-4 border-y border-[#dfe4e1] py-8">
      <WifiOff size={28} className="text-[#66716b]" />
      <h1 className="text-xl font-bold">Public information is temporarily unavailable</h1>
      <p className="text-sm leading-6 text-[#66716b]">We couldn&apos;t load this page. Check your connection and try again, or visit another section.</p>
      <button type="button" disabled={pending} onClick={() => startTransition(retry)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#17201c] px-4 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}{pending ? "Loading page..." : "Try again"}
      </button>
      {pending ? <p role="status" className="text-sm font-semibold">Reconnecting and loading public information...</p> : null}
      <nav aria-label="Producer public pages" className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link className="inline-flex min-h-11 items-center underline" href={base}>Results</Link>
        <Link className="inline-flex min-h-11 items-center underline" href={`${base}/schedule`}>Schedule</Link>
        <Link className="inline-flex min-h-11 items-center underline" href={`${base}/standings`}>Standings</Link>
      </nav>
    </section>
  </main>;
}
