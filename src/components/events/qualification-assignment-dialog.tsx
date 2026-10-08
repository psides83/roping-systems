"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ShieldCheck, LoaderCircle, X } from "lucide-react";
import { loadQualificationAssignment, saveQualificationAssignment } from "@/app/(app)/events/[eventId]/rule-set-actions";

export function QualificationAssignmentDialog({ eventId, ropingId, name, editable }: { eventId: string; ropingId?: string; name?: string; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadQualificationAssignment>> | null>(null);
  const [mode, setMode] = useState("none");
  const [ruleId, setRuleId] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const rule = data?.rules.find((r) => r.id === (mode === "inherit" ? data.eventRuleId : ruleId));
  const close = () => { if (!pending) setOpen(false); };
  return <>
    <button type="button" data-close-mobile-menu disabled={!editable} onClick={() => {
      setOpen(true); setData(null); setError(""); start(async () => {
        try { const loaded = await loadQualificationAssignment(eventId, ropingId); setData(loaded); setMode(loaded.mode); setRuleId(loaded.ruleId ?? ""); }
        catch (e) { setError(e instanceof Error ? e.message : "Unable to load qualification."); }
      });
    }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold disabled:opacity-50"><ShieldCheck size={15} />{ropingId ? "Qualification" : "Event qualification"}</button>
    {open && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-4" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <button type="button" aria-label="Close qualification" onClick={close} className="absolute inset-0" />
      <section role="dialog" aria-modal="true" aria-labelledby="assignment-title" className="relative w-full max-w-lg rounded-md bg-white p-5 shadow-xl">
        <header className="flex items-start justify-between gap-3"><div><h2 id="assignment-title" className="font-bold">{ropingId ? "Roping qualification" : "Event qualification"}</h2>{name && <p className="mt-1 text-sm text-[#66716b]">{name}</p>}</div><button type="button" onClick={close} disabled={pending} aria-label="Close" className="grid h-9 w-9 place-items-center"><X size={20} /></button></header>
        {!data && pending && <p role="status" className="my-6 flex items-center gap-2"><LoaderCircle size={20} className="animate-spin" />Loading qualification rules...</p>}
        {data && <div className="my-5 space-y-4">
          {data.existingClassRules && <p className="text-sm text-amber-800">Existing class qualification rules are active. Saving replaces them with the selection below.</p>}
          {ropingId ? <label className="block text-sm font-semibold">Requirements<select value={mode} onChange={(e) => setMode(e.target.value)} disabled={pending} className="mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] px-3"><option value="inherit">Use event rules</option><option value="none">No qualification required</option><option value="custom">Use different rules</option></select></label>
            : <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={mode === "custom"} disabled={pending} onChange={(e) => setMode(e.target.checked ? "custom" : "none")} />Requires qualification</label>}
          {mode === "custom" && <label className="block text-sm font-semibold">Qualification rule set<select value={ruleId} onChange={(e) => setRuleId(e.target.value)} disabled={pending} className="mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] px-3"><option value="">Choose a rule set</option>{data.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
          {mode === "inherit" && <p className="text-sm text-[#66716b]">{rule ? `Event rules: ${rule.name}` : "No event qualification required"}</p>}
          {rule && mode !== "none" && <p className="text-sm leading-6 text-[#66716b]">{rule.minimum_ropings > 0 ? `${rule.minimum_ropings} ropings attended` : ""}{rule.minimum_ropings > 0 && rule.top_places ? (rule.requirement_match === "all" ? " AND " : " OR ") : ""}{rule.top_places ? `Top ${rule.top_places} in class standings` : ""}{rule.cutoff_on ? ` · Through ${rule.cutoff_on}` : ""}</p>}
          <Link href="/settings/qualifications" className="inline-block text-sm font-semibold underline">Manage qualification rule sets</Link>
        </div>}
        {error && <p role="alert" className="my-4 text-sm text-rose-700">{error}</p>}
        <footer className="mt-5 flex justify-end gap-2 border-t border-[#dfe4e1] pt-4"><button type="button" onClick={close} disabled={pending} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm">Cancel</button><button disabled={pending || !data || (mode === "custom" && !ruleId)} onClick={() => start(async () => {
          setError(""); const result = await saveQualificationAssignment(eventId, ropingId ?? null, mode, mode === "custom" ? ruleId : null);
          if (result.error) setError(result.error); else setOpen(false);
        })} className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white disabled:opacity-50">{pending && <LoaderCircle size={15} className="animate-spin" />}Save qualification</button></footer>
      </section>
    </div>}
  </>;
}
