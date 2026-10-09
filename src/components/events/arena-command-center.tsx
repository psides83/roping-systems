"use client";

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react';
import { EntryLabel } from './entry-label';
import { arenaOverview, type OverviewRoping, type OverviewRun } from '@/lib/events/arena-overview';

export function ArenaCommandCenter({ eventId, ropings, runs, date, arenaCount, assignedArena, updatedAt, eventStatus }: {
  eventId: string; ropings: OverviewRoping[]; runs: OverviewRun[]; date: string; arenaCount: number;
  assignedArena?: string | null; updatedAt: string; eventStatus: string;
}) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const connection = () => setOnline(navigator.onLine);
    connection(); window.addEventListener('online', connection); window.addEventListener('offline', connection);
    const poll = window.setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') transition(() => router.refresh()); }, 20000);
    return () => { clearInterval(poll); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); };
  }, [router]);
  const arenas = arenaOverview(ropings, runs, date, arenaCount, assignedArena);
  const dates = [...new Set(ropings.map(r => r.date))].sort();
  const formatDate = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  const deskLink = (id: string) => `/events/${eventId}/live?division=${encodeURIComponent(id)}`;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <form className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-semibold">Event day<select name="date" defaultValue={date} key={date} className="h-10 rounded-md border border-[#d7ddda] bg-white pl-3 pr-9">{dates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}</select></label><button className="h-10 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold">View day</button></form>
      <div className="flex flex-wrap items-center gap-3"><p role="status" className={`text-xs font-semibold ${online ? 'text-[#66716b]' : 'text-rose-700'}`}>{!online ? 'Offline · Showing last loaded records' : pending ? 'Updating arena records…' : `Updated ${updatedAt} · Refreshes every 20 sec`}</p><button type="button" disabled={pending || !online} onClick={() => transition(() => router.refresh())} aria-label="Refresh arenas" title="Refresh arenas" className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white disabled:opacity-40"><RefreshCw size={18} className={pending ? 'animate-spin' : ''} /></button></div>
    </div>
    {eventStatus !== 'in_progress' && <p className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm font-semibold">{eventStatus === 'completed' ? 'Event completed · Records available for review' : eventStatus === 'cancelled' ? 'Event cancelled · Timing closed' : 'Event has not started · Review arena readiness'}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-2">{arenas.map(a => <section key={a.arena} className="min-w-0 rounded-md border border-[#dfe4e1] bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-[#e7ebe8] p-4"><h2 className="text-lg font-bold">{a.arena}</h2><span className={`text-xs font-bold ${a.current && eventStatus === 'in_progress' ? 'text-emerald-700' : 'text-[#66716b]'}`}>{a.active.length > 1 ? 'Needs review' : a.current && eventStatus === 'in_progress' ? 'In progress' : a.items.length && a.items.every(r => r.status === 'completed') ? 'Completed' : 'Standby'}</span></header>
      <div className="space-y-4 p-4">
        {a.active.length > 1 ? <div>{a.active.map(r => <Link key={r.id} href={deskLink(r.id)} className="flex min-h-11 items-center justify-between gap-3 border-b border-[#e7ebe8] py-2 text-sm font-semibold">{r.name}<ArrowRight size={16} /></Link>)}</div> : a.target ? <>
          <div><p className="text-xs font-semibold text-[#66716b]">{a.current ? 'Current roping' : 'Next roping'}</p><h3 className="mt-1 text-base font-bold">{a.target.name}</h3><p className="mt-1 text-sm text-[#66716b]">{a.round > a.target.rounds ? 'Short round' : `Round ${a.round}`} · {formatDate(a.target.date)}</p>{a.target.schedule && <p className="mt-1 text-xs text-[#66716b]">{a.target.schedule}</p>}{a.target.note && <p className="mt-2 text-sm text-amber-800">{a.target.note}</p>}</div>
          <dl className="grid grid-cols-3 gap-3 border-y border-[#e7ebe8] py-3">{[['Resolved', `${a.resolved} / ${a.total}`], ['Remaining', a.remaining], ['Reruns', a.reruns]].map(([label, number]) => <div key={label}><dt className="text-xs text-[#66716b]">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{number}</dd></div>)}</dl>
          {eventStatus === 'in_progress' && a.inBox && <div className="border-l-4 border-emerald-600 pl-3"><p className="text-xs font-bold text-emerald-700">In the box</p><p className="mt-1 font-bold">{a.inBox.name} · <EntryLabel number={a.inBox.entry} /></p>{a.onDeck && <p className="mt-2 text-sm text-[#66716b]">On deck: {a.onDeck.name} · <EntryLabel number={a.onDeck.entry} /></p>}</div>}
          <Link href={deskLink(a.target.id)} className="inline-flex min-h-11 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">{a.current ? 'Open timing desk' : 'Prepare roping'}<ArrowRight size={16} /></Link>
        </> : <p className="text-sm text-[#66716b]">{a.items.length ? 'All scheduled ropings completed.' : 'No ropings scheduled for this day.'}</p>}
        {!!a.issues.length && <div className="border-l-4 border-amber-500 bg-amber-50 p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><TriangleAlert size={16} />Needs attention</h3><ul className="mt-2 space-y-1 text-sm">{a.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
        {a.current && a.next && <p className="border-t border-[#e7ebe8] pt-3 text-sm"><span className="text-[#66716b]">Next roping: </span><Link href={deskLink(a.next.id)} className="font-semibold underline underline-offset-2">{a.next.name}</Link></p>}
        {!!a.items.length && <details className="border-t border-[#e7ebe8] pt-2"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Day lineup · {a.items.length} {a.items.length === 1 ? 'roping' : 'ropings'}</summary><ol className="divide-y divide-[#e7ebe8]">{a.items.map(r => <li key={r.id}><Link href={deskLink(r.id)} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"><span>{r.name}</span><span className="shrink-0 text-xs text-[#66716b]">{r.status.replaceAll('_', ' ')}</span></Link></li>)}</ol></details>}
      </div>
    </section>)}</div>
  </div>;
}
