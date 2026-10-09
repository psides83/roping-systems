"use client";

import { Printer, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function EventDocumentControls({ printable }: { printable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={pending ? 'animate-spin' : ''} />{pending ? 'Refreshing…' : 'Refresh data'}</button>
    <button type="button" disabled={!printable || pending} onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"><Printer size={16} />Print / save PDF</button>
    {pending && <span role="status" className="text-sm font-semibold">Loading current records…</span>}
  </div>;
}
