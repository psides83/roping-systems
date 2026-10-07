"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, X, LoaderCircle } from "lucide-react";
import { loadRopingQualification, saveRopingQualification } from "@/app/(app)/events/[eventId]/qualification-actions";

export function RopingQualificationDialog({ ropingId, name, editable, required }: { ropingId: string; name: string; editable: boolean; required: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadRopingQualification>> | null>(null);
  const [season, setSeason] = useState("");
  const [bonusEntries, setBonusEntries] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const rule = data?.rules.find((item) => item.season_id === season);
  const load = () => {
    setOpen(true); setData(null); setError("");
    startTransition(async () => {
      try { const result = await loadRopingQualification(ropingId); setData(result); setSeason(result.current?.season_id ?? ""); setBonusEntries(result.current?.bonus_entries_enabled ?? false); }
      catch (error) { setError(error instanceof Error ? error.message : "Unable to load qualification."); }
    });
  };
  return <>
    <button type="button" disabled={!editable} onClick={load} className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold disabled:opacity-50">
      <ShieldCheck size={15} />{required ? "Qualification required" : "Qualification"}
    </button>
    {open ? <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4">
      <button type="button" aria-label="Close qualification" className="absolute inset-0" onClick={() => setOpen(false)} />
      <section role="dialog" aria-modal="true" aria-labelledby={`qualification-${ropingId}`} className="relative w-full max-w-lg rounded-md bg-white p-5 shadow-xl">
        <header className="flex items-start justify-between gap-3">
          <div><h2 id={`qualification-${ropingId}`} className="font-bold">Roping qualification</h2><p className="mt-1 text-sm text-[#66716b]">{name}</p></div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button>
        </header>
        {pending && !data ? <p role="status" className="my-6 flex items-center gap-2"><LoaderCircle size={20} className="animate-spin" />Loading requirements...</p> : null}
        {data ? <div className="my-5 space-y-4">
          <label className="block text-sm font-semibold">Requirements
            <select value={season} onChange={(event) => setSeason(event.target.value)} disabled={pending} className="mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3">
              <option value="">No standings requirement</option>
              {data.seasons.map((item) => <option key={item.id} value={item.id}>{item.name} standings</option>)}
            </select>
          </label>
          {season && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={bonusEntries} onChange={(event) => setBonusEntries(event.target.checked)} disabled={pending} />Add earned bonus positions to the normal entry allowance</label>}
          {rule ? <div className="flex flex-wrap gap-3 text-sm text-[#66716b]">
            {rule.top_places ? <span>Top {rule.top_places} · ties included</span> : null}
            <span>{rule.minimum_ropings} ropings required</span>
            {rule.cutoff_on ? <span>Through {rule.cutoff_on}</span> : <span>Live standings</span>}
            {rule.earned_position_policy !== "none" && <span>{rule.earned_position_policy === "rank" ? "Earned positions bypass rank only" : "Earned positions bypass rank and attendance"}</span>}
          </div> : null}
          {!data.seasons.length ? <Link href="/settings/standings" className="text-sm font-semibold underline">Set up class qualification requirements</Link> : null}
        </div> : null}
        {error ? <p role="alert" className="my-4 text-sm text-rose-700">{error}</p> : null}
        <footer className="mt-5 flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">Cancel</button>
          <button type="button" disabled={pending || !data} onClick={() => startTransition(async () => {
            setError(""); const result = await saveRopingQualification(ropingId, season, !!season && bonusEntries);
            if (result.error) setError(result.error); else setOpen(false);
          })} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}Save qualification
          </button>
        </footer>
      </section>
    </div> : null}
  </>;
}
