"use client";

import { Dialog } from "@/components/ui/dialog";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useId, useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { saveQualificationRuleSet, deleteQualificationRuleSet } from "@/app/(app)/settings/qualifications/actions";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";
import { CutoffDateLabel } from "@/components/settings/cutoff-date-label";

const control = "mt-2 block h-11 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";

export function QualificationRuleSetForm({ rule, seasons, editable, finalsRule }: { finalsRule?: { id: string; name: string; seasonName: string }; rule?: QualificationRuleSet; seasons: { id: string; name: string; starts_on: string; ends_on: string }[]; editable: boolean }) {
  const helpId = useId();
  const anotherFinals = finalsRule && finalsRule.id !== rule?.id;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [seasonId, setSeasonId] = useState(rule?.season_id ?? "");
  const season = seasons.find((item) => item.id === seasonId);
  return <>
    <button disabled={!editable} type="button" onClick={() => { setOpen(true); setError(""); setDeleting(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-50">{rule ? <Pencil size={15} /> : <Plus size={15} />}{rule ? "Edit" : "Create rule set"}</button>
    {open && <Dialog title={deleting ? "Delete rule set?" : rule ? "Edit qualification rules" : "Create qualification rules"} description="Entry requirements for finals or any other qualified roping." onClose={() => setOpen(false)} busy={pending}>
      <div className="p-5">
        {deleting ? <div className="mt-5 space-y-4"><p className="text-sm">Delete {rule?.name}? Rule sets assigned to events or ropings cannot be deleted.</p>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setDeleting(false)} className={control}>Cancel</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await deleteQualificationRuleSet(rule!.id); if (result.error) setError(result.error); else setOpen(false); })} className="mt-2 h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white">Delete rule set</button></div></div> : <PersistentForm action={(form) => start(async () => { setError(""); const result = await saveQualificationRuleSet(rule?.id ?? null, form); if (result.error) setError(result.error); else setOpen(false); })} className="mt-5 min-w-0 space-y-5">
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <p className="text-sm leading-6 text-[#526059]">Save this rule set, then assign it to an event or individual roping. Mark it as finals to publish its requirements on the public standings page.</p>
            <input type="hidden" name="class_key" value={rule?.class_key ?? ""} />
            {rule?.class_key && <p className="text-sm text-[#66716b]">This converted rule retains its original classification scope. Its name identifies that class.</p>}
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="is_finals" disabled={Boolean(anotherFinals)} defaultChecked={rule?.is_finals ?? false} aria-describedby={`${helpId}-finals`} />Finals qualification rules — publish on public standings</label>
            <p id={`${helpId}-finals`} className="text-sm leading-6 text-[#66716b]">{anotherFinals ? `${finalsRule.name} (${finalsRule.seasonName}) is already the finals rule. Clear its finals setting before marking a different rule as finals.` : "Only one rule can be designated as finals for your producer. Choose its season below. Publishing does not assign the rule to an event or register any roper."}</p>
            <label className="block text-sm font-semibold">Name<input name="name" defaultValue={rule?.name} required maxLength={100} className={control} /></label>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Season (required)<select name="season_id" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} required className={control}><option value="" disabled>Choose a season</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm font-semibold"><CutoffDateLabel /><input name="cutoff_on" type="date" defaultValue={rule?.cutoff_on ?? ""} min={season?.starts_on} max={season?.ends_on} className={control} /></label><label className="text-sm font-semibold"><CutoffDateLabel kind="attendance" /><input name="attendance_cutoff_on" type="date" defaultValue={rule?.attendance_cutoff_on ?? ""} min={season?.starts_on} max={season?.ends_on} className={control} /></label></div>
            <p className="text-sm leading-6 text-[#66716b]">Cutoff dates include that day. Leave either date blank to use the end of the selected season.</p>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Minimum ropings<input name="minimum_ropings" aria-describedby={`${helpId}-regular`} type="number" min={0} max={10000} defaultValue={rule?.minimum_ropings ?? 0} required className={`${control} w-28`} /></label><label className="text-sm font-semibold">Top standings places<input name="top_places" aria-describedby={`${helpId}-regular`} type="number" min={1} defaultValue={rule?.top_places ?? ""} placeholder="No limit" className={`${control} w-32`} /></label></div>
            <p id={`${helpId}-regular`} className="text-sm leading-6 text-[#66716b]">Minimum ropings is the attendance requirement: 0 means none. Top standings places is the rank limit: blank means none. Attendance follows each roping’s attendance-count setting.</p>
            <label className="block text-sm font-semibold">Regular qualification<select name="requirement_match" aria-describedby={`${helpId}-match`} defaultValue={rule?.requirement_match ?? "all"} className={control}><option value="all">Meet attendance AND standings requirements</option><option value="any">Meet attendance OR standings requirement</option></select></label>
            <p id={`${helpId}-match`} className="text-sm leading-6 text-[#66716b]">For 5 ropings and top 15, AND requires both; OR accepts either. Only requirements you enable are compared. With neither enabled, there is no regular qualification restriction.</p>
            <label className="block text-sm font-semibold">Earned qualifying positions<select name="earned_position_policy" aria-describedby={`${helpId}-earned`} defaultValue={rule?.earned_position_policy ?? "none"} className={control}><option value="none">Do not bypass regular requirements</option><option value="rank">Bypass standings; attendance still required</option><option value="rank_and_attendance">Bypass standings and attendance</option></select></label>
            <p id={`${helpId}-earned`} className="text-sm leading-6 text-[#66716b]">This controls which qualification requirements an assigned earned finals position can bypass. Other entry eligibility checks still apply.</p>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-describedby={`${helpId}-bonus`} name="bonus_entries_enabled" defaultChecked={rule?.bonus_entries_enabled ?? false} />Add earned positions to the normal entry allowance</label>
            <p id={`${helpId}-bonus`} className="text-sm leading-6 text-[#66716b]">When enabled, assigned earned positions add bonus entries above the normal entry allowance. This does not create an entry or register the roper automatically.</p>
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[#dfe4e1] pt-4">{rule && <button type="button" disabled={pending} onClick={() => setDeleting(true)} className="mr-auto inline-flex h-10 items-center gap-2 px-2 text-sm text-rose-700"><Trash2 size={15} />Delete</button>}<button type="button" data-dialog-close disabled={pending} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm">Cancel</button><button disabled={pending || !seasons.length} className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white">{pending && <LoaderCircle size={15} className="animate-spin" />}Save rules</button></footer>
        </PersistentForm>}
      </div>
    </Dialog>}
  </>;
}
