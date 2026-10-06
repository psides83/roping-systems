"use client";

import { useState, useTransition } from "react";
import { Copy, LoaderCircle, X } from "lucide-react";
import { copyEventDaySchedule } from "@/app/(app)/events/[eventId]/actions";

export function CopyDayScheduleDialog({ eventId, sourceDate, dates, enabled }: {
  eventId: string; sourceDate: string; dates: string[]; enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState(dates[0] ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const label = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  if (!enabled || !dates.length) return null;
  return <>
    <button type="button" onClick={() => { setMessage(""); setDestination(dates[0]); setOpen(true); }} className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><Copy size={15} />Add same schedule</button>
    {open ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby={`copy-day-${sourceDate}`} className="w-full max-w-md rounded-md bg-white p-5 shadow-xl">
        <header className="flex items-center justify-between gap-3"><h2 id={`copy-day-${sourceDate}`} className="text-lg font-bold">Add same schedule</h2><button type="button" disabled={pending} aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"><X size={18} /></button></header>
        <p className="mt-3 text-sm text-[#66716b]">Copy the ropings, arena assignments, start times, fees, and payout setup from {label(sourceDate)}. Entries, results, and added-money allocations are not copied.</p>
        <label className="mt-4 block text-sm font-semibold">Destination date<select value={destination} onChange={(event) => setDestination(event.target.value)} className="mt-2 block h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3">{dates.map((date) => <option key={date} value={date}>{label(date)}</option>)}</select></label>
        {message ? <p role="alert" className="mt-4 text-sm text-rose-700">{message}</p> : null}
        <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#e1e6e3] pt-4"><button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">Cancel</button><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await copyEventDaySchedule(eventId, sourceDate, destination); if (result.success) setOpen(false); else setMessage(result.message ?? "Unable to copy schedule."); })} className="flex min-h-10 items-center gap-2 rounded-md brand-accent-fill px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <Copy size={15} />}Add same schedule to {label(destination)}</button></footer>
      </section>
    </div> : null}
  </>;
}
