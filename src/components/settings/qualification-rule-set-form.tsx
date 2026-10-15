"use client";

import { Dialog } from "@/components/ui/dialog";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useId, useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { saveQualificationRuleSet, deleteQualificationRuleSet } from "@/app/(app)/settings/qualifications/actions";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";
import { CutoffDateLabel } from "@/components/settings/cutoff-date-label";

const control = "mt-2 block h-11 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";

export function QualificationRuleSetForm({ rule, seasons, editable }: { rule?: QualificationRuleSet; seasons: { id: string; name: string; starts_on: string; ends_on: string }[]; editable: boolean }) {
  const helpId = useId();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [seasonId, setSeasonId] = useState(rule?.season_id ?? seasons[0]?.id ?? "");
  const season = seasons.find((item) => item.id === seasonId);
  return <>
    <button disabled={!editable} type="button" onClick={() => { setOpen(true); setError(""); setDeleting(false); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-50">{rule ? <Pencil size={15} /> : <Plus size={15} />}{rule ? "Edit" : "Create rule set"}</button>
    {open && <Dialog title={deleting ? "Delete rule set?" : rule ? "Edit non-finals qualification rules" : "Create non-finals qualification rules"} description="Attendance and rank requirements for non-finals ropings." onClose={() => setOpen(false)} busy={pending}>
      <div className="p-5">
        {deleting ? <div className="mt-5 space-y-4"><p className="text-sm">Delete {rule?.name}? Rule sets assigned to events or ropings cannot be deleted.</p>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setDeleting(false)} className={control}>Cancel</button><button type="button" disabled={pending} onClick={() => start(async () => { const result = await deleteQualificationRuleSet(rule!.id); if (result.error) setError(result.error); else setOpen(false); })} className="mt-2 h-10 rounded-md bg-rose-700 px-3 text-sm font-semibold text-white">Delete rule set</button></div></div> : <PersistentForm action={(form) => start(async () => { setError(""); const result = await saveQualificationRuleSet(rule?.id ?? null, form); if (result.error) setError(result.error); else setOpen(false); })} className="mt-5 space-y-5">
          <fieldset disabled={pending} className="space-y-4">
            <p className="text-sm leading-6 text-[#526059]">Save these non-finals rules, then assign the rule set to an event or individual roping. For finals, use Finals Qualifications instead.</p>
            <label className="block text-sm font-semibold">Name<input name="name" defaultValue={rule?.name} required maxLength={100} className={control} /></label>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Season<select name="season_id" value={seasonId} onChange={(e) => setSeasonId(e.target.value)} required className={control}>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm font-semibold"><CutoffDateLabel /><input name="cutoff_on" type="date" defaultValue={rule?.cutoff_on ?? ""} min={season?.starts_on} max={season?.ends_on} className={control} /></label><label className="text-sm font-semibold"><CutoffDateLabel kind="attendance" /><input name="attendance_cutoff_on" type="date" defaultValue={rule?.attendance_cutoff_on ?? ""} min={season?.starts_on} max={season?.ends_on} className={control} /></label></div>
            <p className="text-sm leading-6 text-[#66716b]">Cutoff dates include that day. Leave either date blank to use the end of the selected season.</p>
            <div className="flex flex-wrap gap-4"><label className="text-sm font-semibold">Minimum ropings<input name="minimum_ropings" aria-describedby={`${helpId}-regular`} type="number" min={0} max={10000} defaultValue={rule?.minimum_ropings ?? 0} required className={`${control} w-28`} /></label><label className="text-sm font-semibold">Top standings places<input name="top_places" aria-describedby={`${helpId}-regular`} type="number" min={1} defaultValue={rule?.top_places ?? ""} placeholder="No limit" className={`${control} w-32`} /></label></div>
            <p id={`${helpId}-regular`} className="text-sm leading-6 text-[#66716b]">Minimum ropings is the attendance requirement: 0 means none. Top standings places is the rank limit: blank means none. Attendance follows each roping’s attendance-count setting.</p>
            <label className="block text-sm font-semibold">Regular qualification<select name="requirement_match" aria-describedby={`${helpId}-match`} defaultValue={rule?.requirement_match ?? "all"} className={control}><option value="all">Meet attendance AND standings requirements</option><option value="any">Meet attendance OR standings requirement</option></select></label>
            <p id={`${helpId}-match`} className="text-sm leading-6 text-[#66716b]">For 5 ropings and top 15, AND requires both; OR accepts either. Only requirements you enable are compared. With neither enabled, there is no regular qualification restriction.</p>
            {rule && (rule.earned_position_policy !== "none" || rule.bonus_entries_enabled) ? <details className="rounded-md border border-amber-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Existing finals-related settings</summary><p className="mt-2 text-sm leading-6 text-[#66716b]">This existing rule set includes earned-position settings. They are preserved for existing events. For new finals ropings, use Finals Qualifications instead.</p>
            <label className="block text-sm font-semibold">Earned qualifying positions<select name="earned_position_policy" aria-describedby={`${helpId}-earned`} defaultValue={rule?.earned_position_policy ?? "none"} className={control}><option value="none">Do not bypass regular requirements</option><option value="rank">Bypass standings; attendance still required</option><option value="rank_and_attendance">Bypass standings and attendance</option></select></label>
            <p id={`${helpId}-earned`} className="text-sm leading-6 text-[#66716b]">This controls which qualification requirements an assigned earned finals position can bypass. Other entry eligibility checks still apply.</p>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-describedby={`${helpId}-bonus`} name="bonus_entries_enabled" defaultChecked={rule?.bonus_entries_enabled ?? false} />Add earned positions to the normal entry allowance</label>
            <p id={`${helpId}-bonus`} className="text-sm leading-6 text-[#66716b]">When enabled, assigned earned positions add bonus entries above the normal entry allowance. This does not create an entry or register the roper automatically.</p>
            </details> : <><input type="hidden" name="earned_position_policy" value="none" /><input type="hidden" name="bonus_entries_enabled" value="" /></>}
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <footer className="flex flex-wrap justify-end gap-2 border-t border-[#dfe4e1] pt-4">{rule && <button type="button" disabled={pending} onClick={() => setDeleting(true)} className="mr-auto inline-flex h-10 items-center gap-2 px-2 text-sm text-rose-700"><Trash2 size={15} />Delete</button>}<button type="button" data-dialog-close disabled={pending} className="h-10 rounded-md border border-[#ccd4d0] px-3 text-sm">Cancel</button><button disabled={pending || !seasons.length} className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white">{pending && <LoaderCircle size={15} className="animate-spin" />}Save rules</button></footer>
        </PersistentForm>}
      </div>
    </Dialog>}
  </>;
}
