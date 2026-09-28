"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, LoaderCircle, Save, Search, Shuffle, SkipForward } from "lucide-react";
import { generateDraw, recordRun, type LiveRunState } from "@/app/(app)/ropings/[ropingId]/actions";
import { cn } from "@/lib/utils";

export interface LiveRunRow { id: string; drawPosition: number | null; name: string; entryNumber: number; rawTime: number | null; penalty: number; status: string }

interface LiveDeskProps {
  ropingId: string;
  divisions: Array<{ id: string; name: string }>;
  selectedDivisionId: string;
  runs: LiveRunRow[];
  timerCount: number;
  timerResolution: "average" | "best" | "longest";
}

export function DatabaseLiveDesk({ ropingId, divisions, selectedDivisionId, runs, timerCount, timerResolution }: LiveDeskProps) {
  const currentRun = runs.find((run) => run.status === "pending") ?? null;
  const completeCount = runs.filter((run) => run.status !== "pending").length;
  const drawAction = generateDraw.bind(null, ropingId);
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
    <section className="order-2 overflow-hidden rounded-md border border-[#dfe4e1] bg-white xl:order-1">
      <div className="flex flex-col gap-3 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">{divisions.find((division) => division.id === selectedDivisionId)?.name}</h2><p className="text-xs text-[#758078]">Round 1 · {runs.length} entries</p></div><div className="flex gap-2"><label className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]"><Search size={15} /><input aria-label="Search draw" className="w-28 bg-transparent text-xs outline-none" placeholder="Find contestant" /></label><button className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold">Entry class <ChevronDown size={14} /></button></div></div>
      <div className="flex items-center justify-between border-b border-[#e7ebe8] bg-[#fafbfa] px-4 py-3"><p className="text-xs text-[#758078]">{runs.some((run) => run.drawPosition) ? "Draw order is set" : "Draw has not been generated"}</p><form action={drawAction}><input type="hidden" name="divisionId" value={selectedDivisionId} /><input type="hidden" name="runNumber" value="1" /><button className="flex h-8 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-xs font-semibold"><Shuffle size={14} /> Generate draw</button></form></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]"><tr><th className="w-20 px-5 py-3">Draw</th><th className="px-5 py-3">Contestant</th><th className="px-5 py-3">Entry</th><th className="px-5 py-3 text-right">Time</th><th className="px-5 py-3 text-right">Penalty</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-[#e7ebe8]">{runs.map((run) => <tr key={run.id} className={cn(currentRun?.id === run.id && "bg-[#fff6f2] ring-1 ring-inset ring-[#e8ad9c]")}><td className="px-5 py-4 font-mono text-sm font-bold">{run.drawPosition ?? "-"}</td><td className="px-5 py-4"><p className="text-sm font-semibold">{run.name}</p>{currentRun?.id === run.id ? <p className="mt-1 text-[10px] font-bold uppercase text-[var(--brand-accent-strong)]">In the box</p> : null}</td><td className="px-5 py-4 text-sm">#{run.entryNumber}</td><td className="px-5 py-4 text-right font-mono text-sm font-semibold">{run.status === "complete" ? run.rawTime?.toFixed(3) : run.status === "no_time" ? "NT" : "-"}</td><td className="px-5 py-4 text-right font-mono text-sm">{run.penalty ? `+${run.penalty}` : "-"}</td><td className="px-5 py-4 text-right font-mono text-sm font-bold">{run.status === "complete" && run.rawTime !== null ? (run.rawTime + run.penalty).toFixed(3) : run.status === "no_time" ? "NT" : "-"}</td></tr>)}</tbody></table>{!runs.length ? <div className="p-10 text-center text-sm text-[#758078]">No entries have been added to this entry class.</div> : null}</div>
      <div className="border-t border-[#e7ebe8] bg-[#fafbfa] px-5 py-3 text-xs text-[#758078]">{completeCount} completed · {runs.length - completeCount} remaining</div>
    </section>
    <aside className="order-1 space-y-4 xl:order-2">{currentRun ? <RunEntryForm key={currentRun.id} ropingId={ropingId} run={currentRun} timerCount={timerCount} timerResolution={timerResolution} /> : <div className="rounded-md border border-[#dfe4e1] bg-white p-6 text-center"><p className="font-bold">{runs.length ? "Entry class complete" : "Waiting for entries"}</p><p className="mt-2 text-sm leading-6 text-[#758078]">{runs.length ? "Every run in this entry class has a result." : "Add contestants before generating a draw."}</p></div>}<div className="rounded-md border border-[#dfe4e1] bg-white p-4"><p className="text-xs font-bold uppercase text-[#758078]">Entry classes</p><div className="mt-3 space-y-1">{divisions.map((division) => <Link key={division.id} href={`/ropings/${ropingId}/live?division=${division.id}`} className={cn("block rounded-md px-3 py-2 text-sm font-semibold", division.id === selectedDivisionId ? "brand-primary-fill text-white" : "hover:bg-[#f1f3f2]")}>{division.name}</Link>)}</div></div></aside>
  </div>;
}

function RunEntryForm({ ropingId, run, timerCount, timerResolution }: { ropingId: string; run: LiveRunRow; timerCount: number; timerResolution: "average" | "best" | "longest" }) {
  const action = recordRun.bind(null, ropingId);
  const [state, formAction, pending] = useActionState<LiveRunState, FormData>(action, {});
  const [times, setTimes] = useState<string[]>(() => Array.from({ length: timerCount }, () => ""));
  const [penalty, setPenalty] = useState("0");
  const resolved = useMemo(() => {
    const values = times.map(Number);
    if (times.some((value) => !value) || values.some(Number.isNaN)) return null;
    if (timerResolution === "best") return Math.min(...values);
    if (timerResolution === "longest") return Math.max(...values);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [times, timerResolution]);
  const total = resolved === null ? "--.---" : (resolved + Number(penalty)).toFixed(3);
  const methodLabel = timerResolution === "best" ? "Fastest reading" : timerResolution === "longest" ? "Longest reading" : "Average reading";

  return <form action={formAction} className="rounded-md border border-[#e0c2b9] bg-white p-5"><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="penalty" value={penalty} /><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Draw {run.drawPosition ?? "-"} · Entry {run.entryNumber}</p><h2 className="mt-1 text-xl font-bold">{run.name}</h2><div className="mt-5"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-[#66716b]">Timer readings</p><p className="text-[10px] font-semibold text-[#758078]">{methodLabel}</p></div><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{times.map((time, index) => <label key={index} className="flex items-center gap-3 rounded-md border-2 border-[#bec7c2] px-3 focus-within:border-[var(--brand-accent)]"><span className="text-xs font-bold text-[#758078]">T{index + 1}</span><input name="timerReading" inputMode="decimal" value={time} onChange={(event) => setTimes((current) => current.map((value, timerIndex) => timerIndex === index ? event.target.value : value))} className="h-14 min-w-0 flex-1 bg-transparent font-mono text-2xl font-bold outline-none placeholder:text-[#c9cecb]" placeholder="0.000" /><span className="text-xs font-semibold text-[#758078]">sec</span></label>)}</div></div><div className="mt-4"><p className="text-xs font-bold uppercase text-[#66716b]">Penalty</p><div className="mt-2 grid grid-cols-3 gap-2">{["0", "5", "10"].map((value) => <button type="button" key={value} onClick={() => setPenalty(value)} className={cn("h-11 rounded-md border text-sm font-bold", penalty === value ? "border-[var(--brand-primary)] brand-primary-fill text-white" : "border-[#d7ddda]")}>{value === "0" ? "None" : `+${value}`}</button>)}</div></div><div className="mt-5 flex items-center justify-between border-y border-[#e7ebe8] py-4"><span className="text-sm font-semibold text-[#66716b]">Official time</span><span className="font-mono text-2xl font-bold">{total}</span></div>{state.message ? <p className={`mt-3 rounded-md p-3 text-xs ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{state.message}</p> : null}<button name="status" value="complete" disabled={pending || resolved === null} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md brand-accent-fill text-sm font-bold text-white disabled:opacity-40">{pending ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={18} />} Save & next run</button><div className="mt-2 grid grid-cols-2 gap-2"><button name="status" value="no_time" className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold"><AlertCircle size={15} /> No time</button><button name="status" value="scratch" className="flex h-10 items-center justify-center gap-2 rounded-md border border-[#d7ddda] text-xs font-semibold"><SkipForward size={15} /> Scratch</button></div></form>;
}
