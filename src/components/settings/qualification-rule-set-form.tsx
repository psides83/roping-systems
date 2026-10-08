"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { saveQualificationRuleSet, deleteQualificationRuleSet } from "@/app/(app)/settings/qualifications/actions";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";

const control = "mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";

export function QualificationRuleSetForm({ rule, seasons, editable }: { rule?: QualificationRuleSet; seasons: { id: string; name: string; starts_on: string; ends_on: string }[]; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [seasonId, setSeasonId] = useState(rule?.season_id ?? seasons[0]?.id ?? "");
  const season = seasons.find((item) => item.id === seasonId);
  return <>
    <button disabled={!editable} type="button" onClick={() => { setOpen(true); setError(""); setDeleting(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-50">{rule ? <Pencil size={15} /> : <Plus size={15} />}{rule ? "Edit" : "Create rule set"}</button>
    {open && <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/45 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="qualification-rule-title" className="relative my-6 w-full max-w-xl rounded-md bg-white p-5 shadow-xl">
        <header className="flex items-center justify-between gap-3"><h2 id="qualification-rule-title" className="font-bold">{deleting ? "Delete rule set?" : rule ? "Edit qualification rules" : "Create qualification rules"}</h2><button type="button" disabled={pending} aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center"><X size={20} /></button></header>
        {deleting ? <div className="mt-5 space-y-4"><p className="text-sm">Delete {rule?.name}? Rule sets assigned to events or ropings cannot be deleted.</p>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setDeleting(false)} className={control}>Cancel</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await deleteQualificationRuleSet(rule!.id); if (result.error) setError(result.error); else setOpen(false); })} className="mt-2 h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white">Delete rule set</button></div></div> : <form action={(form) => start(async () => { setError(""); const result = await saveQualificationRuleSet(rule?.id ?? null, form); if (result.error) setError(result.error); else setOpen(false); })} className="mt-5 space-y-5">
          <fieldset disabled={pending} className="space-y-4">
            <label className="block text-sm font-semibold">Name<input name="name" defaultValue={rule?.name} required maxLength={100} className={control} /></label>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Season<select name="season_id" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} required className={control}>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm font-semibold">Cutoff date<input name="cutoff_on" type="date" defaultValue={rule?.cutoff_on ?? ""} min={season?.starts_on} max={season?.ends_on} className={control} /></label></div>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Minimum ropings<input name="minimum_ropings" type="number" min={0} max={10000} defaultValue={rule?.minimum_ropings ?? 0} required className={`${control} w-28`} /></label><label className="text-sm font-semibold">Top standings places<input name="top_places" type="number" min={1} defaultValue={rule?.top_places ?? ""} placeholder="No limit" className={`${control} w-32`} /></label></div>
            <label className="block text-sm font-semibold">Regular qualification<select name="requirement_match" defaultValue={rule?.requirement_match ?? "all"} className={control}><option value="all">Meet attendance AND standings requirements</option><option value="any">Meet attendance OR standings requirement</option></select></label>
            <label className="block text-sm font-semibold">Earned qualifying positions<select name="earned_position_policy" defaultValue={rule?.earned_position_policy ?? "none"} className={control}><option value="none">Do not bypass regular requirements</option><option value="rank">Bypass standings; attendance still required</option><option value="rank_and_attendance">Bypass standings and attendance</option></select></label>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="bonus_entries_enabled" defaultChecked={rule?.bonus_entries_enabled ?? false} />Add earned positions to the normal entry allowance</label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[#dfe4e1] pt-4">{rule && <button type="button" disabled={pending} onClick={() => setDeleting(true)} className="mr-auto inline-flex h-10 items-center gap-2 px-2 text-sm text-rose-700"><Trash2 size={15} />Delete</button>}<button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm">Cancel</button><button disabled={pending || !seasons.length} className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white">{pending && <LoaderCircle size={15} className="animate-spin" />}Save rules</button></footer>
        </form>}
      </section>
    </div>}
  </>;
}
