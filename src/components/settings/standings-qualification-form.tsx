"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useState } from "react";
import { saveQualificationRule } from "@/app/(app)/settings/standings/actions";
import { CutoffDateLabel } from "@/components/settings/cutoff-date-label";

export function StandingsQualificationForm({ season, classId, rule, canEdit }: {
  season: { id: string; startsOn: string; endsOn: string }; classId: string; canEdit: boolean;
  rule?: { top_places: number | null; minimum_ropings: number; cutoff_on: string | null; attendance_cutoff_on: string | null; earned_position_policy: string };
}) {
  const [enabled, setEnabled] = useState(Boolean(rule));
  const [state, action, pending] = useActionState(saveQualificationRule, {});
  const input = "mt-1 block h-11 w-40 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
  return <PersistentForm action={action} className="space-y-5 border-t border-[#dfe4e1] pt-5">
    <input type="hidden" name="season" value={season.id} /><input type="hidden" name="class" value={classId} />
    <fieldset disabled={!canEdit || pending} className="space-y-5">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Finals qualification requirements</label>
      <p className="text-sm leading-6 text-[#526059]">{enabled ? "Finals requirements apply to the selected season and classification after saving. Leave Top places blank for no rank limit." : "Saving with requirements unchecked removes this season and classification’s finals requirements."}</p>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-semibold">Top places<input name="topPlaces" type="number" min={1} max={10000} defaultValue={rule?.top_places ?? ""} placeholder="No placing limit" className={input} /></label>
        <label className="text-sm font-semibold">Minimum ropings<input name="minimumRopings" type="number" min={0} max={10000} defaultValue={rule?.minimum_ropings ?? 0} required className={input} /></label>
        <label className="text-sm font-semibold"><CutoffDateLabel /><input name="cutoff" type="date" min={season.startsOn} max={season.endsOn} defaultValue={rule?.cutoff_on ?? ""} className={input} /></label>
        <label className="text-sm font-semibold"><CutoffDateLabel kind="attendance" /><input name="attendanceCutoff" type="date" min={season.startsOn} max={season.endsOn} defaultValue={rule?.attendance_cutoff_on ?? ""} className={input} /></label>
      </div>
      <label className="grid gap-2 text-sm font-semibold">Bonus entry requirements<select name="earnedPositionPolicy" defaultValue={rule?.earned_position_policy ?? "none"} className="h-11 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="none">Rank and minimum attendance required</option><option value="rank">Minimum attendance required; rank limit waived</option><option value="rank_and_attendance">No rank or minimum attendance requirement</option></select></label>
      <button className="h-11 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">{pending ? "Saving..." : "Save requirements"}</button>
    </fieldset>
    {!canEdit && <p className="text-sm text-[#66716b]">Only producer owners and administrators can change these requirements.</p>}
    {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-emerald-700">Requirements saved for this season and classification.</p> : null}
  </PersistentForm>;
}
