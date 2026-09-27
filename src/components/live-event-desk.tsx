"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, Clock3, RotateCcw, Save, Search, SkipForward } from "lucide-react";
import { liveRuns } from "@/data/demo";
import { cn } from "@/lib/utils";

export function LiveEventDesk() {
  const [time, setTime] = useState("");
  const [penalty, setPenalty] = useState("0");
  const total = useMemo(() => {
    const entered = Number(time);
    if (!time || Number.isNaN(entered)) return "--.--";
    return (entered + Number(penalty)).toFixed(2);
  }, [time, penalty]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="order-2 overflow-hidden rounded-md border border-[#dfe4e1] bg-white xl:order-1">
        <div className="flex flex-col gap-3 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><div className="relative"><span className="block h-3 w-3 rounded-full bg-[#bb3e24]" /><span className="absolute inset-0 animate-ping rounded-full bg-[#bb3e24] opacity-30" /></div><div><h2 className="font-bold">Open Division</h2><p className="text-xs text-[#758078]">Round 1 · 34 entries</p></div></div>
          <div className="flex gap-2"><label className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]"><Search size={15} /><input aria-label="Search draw" className="w-28 bg-transparent text-xs outline-none" placeholder="Find contestant" /></label><button className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold">Open Division <ChevronDown size={14} /></button></div>
        </div>
        <div className="overflow-x-auto scrollbar-subtle"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]"><tr><th className="w-20 px-5 py-3">Draw</th><th className="px-5 py-3">Contestant</th><th className="px-5 py-3">Entry</th><th className="px-5 py-3 text-right">Time</th><th className="px-5 py-3 text-right">Penalty</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-[#e7ebe8]">{liveRuns.map((run) => <tr key={run.draw} className={cn(run.status === "current" && "bg-[#fff6f2] ring-1 ring-inset ring-[#e8ad9c]", run.status === "waiting" && "text-[#6c7771]")}><td className="px-5 py-4 font-mono text-sm font-bold">{run.draw}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-bold", run.status === "current" ? "bg-[#bb3e24] text-white" : "bg-[#eef1ef] text-[#526058]")}>{run.name.split(" ").map((part) => part[0]).join("")}</span><div><p className="text-sm font-semibold text-[#17201c]">{run.name}</p>{run.status === "current" ? <p className="text-[11px] font-bold uppercase text-[#bb3e24]">In the box</p> : null}</div></div></td><td className="px-5 py-4 text-sm">#{run.entry}</td><td className="px-5 py-4 text-right font-mono text-sm font-semibold">{run.time || "-"}</td><td className="px-5 py-4 text-right font-mono text-sm">{run.penalty || "-"}</td><td className="px-5 py-4 text-right font-mono text-sm font-bold">{run.total || "-"}</td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-[#e7ebe8] bg-[#fafbfa] px-5 py-3 text-xs text-[#758078]"><span>19 completed · 15 remaining</span><span>Last saved just now</span></div>
      </section>

      <aside className="order-1 space-y-4 xl:order-2">
        <section className="rounded-md border border-[#e0c2b9] bg-white p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-[#bb3e24]">Draw 20 · Entry 1</p><h2 className="mt-1 text-xl font-bold">Mason Cole</h2></div><Clock3 size={22} className="text-[#bb3e24]" /></div>
          <div className="mt-5"><label className="text-xs font-bold uppercase text-[#66716b]" htmlFor="run-time">Raw time</label><div className="mt-2 flex items-baseline rounded-md border-2 border-[#bec7c2] bg-white px-4 focus-within:border-[#bb3e24]"><input id="run-time" inputMode="decimal" value={time} onChange={(event) => setTime(event.target.value)} className="h-20 min-w-0 flex-1 bg-transparent font-mono text-4xl font-bold outline-none placeholder:text-[#c9cecb]" placeholder="0.00" /><span className="text-sm font-semibold text-[#758078]">sec</span></div></div>
          <div className="mt-4"><p className="text-xs font-bold uppercase text-[#66716b]">Penalty</p><div className="mt-2 grid grid-cols-3 gap-2">{["0", "5", "10"].map((value) => <button key={value} onClick={() => setPenalty(value)} className={cn("h-11 rounded-md border text-sm font-bold", penalty === value ? "border-[#17251f] bg-[#17251f] text-white" : "border-[#d7ddda] bg-white hover:bg-[#f7f8f7]")}>{value === "0" ? "None" : `+${value}`}</button>)}</div></div>
          <div className="mt-5 flex items-center justify-between border-y border-[#e7ebe8] py-4"><span className="text-sm font-semibold text-[#66716b]">Official time</span><span className="font-mono text-2xl font-bold">{total}</span></div>
          <button disabled={!time} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#bb3e24] text-sm font-bold text-white enabled:hover:bg-[#91301c] disabled:cursor-not-allowed disabled:opacity-40"><Save size={18} /> Save & next run</button>
          <div className="mt-2 grid grid-cols-2 gap-2"><button className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold"><AlertCircle size={15} /> No time</button><button className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold"><SkipForward size={15} /> Scratch</button></div>
        </section>
        <section className="rounded-md border border-[#dfe4e1] bg-white p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-[#758078]">Public results</p><p className="mt-1 flex items-center gap-2 text-sm font-bold text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" /> Unofficial · Live</p></div><button className="text-xs font-semibold text-[#a83720]">Preview</button></div><div className="mt-4 flex items-center gap-2 rounded-md bg-[#f4f6f5] p-3 text-xs leading-5 text-[#66716b]"><Check size={16} className="shrink-0 text-emerald-600" /> Results update automatically after every saved run.</div></section>
        <button className="flex h-10 w-full items-center justify-center gap-2 text-xs font-semibold text-[#66716b]"><RotateCcw size={15} /> View correction history</button>
      </aside>
    </div>
  );
}
