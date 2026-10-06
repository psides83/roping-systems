"use client";
import { useActionState } from "react";
import { saveQualificationRule } from "@/app/(app)/settings/standings/actions";

export function StandingsQualificationForm({ season, classId, rule, canEdit }: {
  season: { id: string; startsOn: string; endsOn: string }; classId: string; canEdit: boolean;
  rule?: { top_places: number | null; minimum_ropings: number; cutoff_on: string | null };
}) {
  const [state, action, pending] = useActionState(saveQualificationRule, {});
  const input = "mt-1 block h-10 w-40 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
  return <form action={action} className="space-y-5 border-t border-[#dfe4e1] pt-5">
    <input type="hidden" name="season" value={season.id} /><input type="hidden" name="class" value={classId} />
    <fieldset disabled={!canEdit || pending} className="space-y-5">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={!!rule} />Qualification requirements</label>
      <div className="flex flex-wrap gap-4">
        <label className="text-xs font-semibold">Top places<input name="topPlaces" type="number" min={1} max={10000} defaultValue={rule?.top_places ?? ""} placeholder="No placing limit" className={input} /></label>
        <label className="text-xs font-semibold">Minimum ropings<input name="minimumRopings" type="number" min={0} max={10000} defaultValue={rule?.minimum_ropings ?? 0} required className={input} /></label>
        <label className="text-xs font-semibold">Cutoff date<input name="cutoff" type="date" min={season.startsOn} max={season.endsOn} defaultValue={rule?.cutoff_on ?? ""} className={input} /></label>
      </div>
      <button className="h-10 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">{pending ? "Saving..." : "Save requirements"}</button>
    </fieldset>
    {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-emerald-700">Saved</p> : null}
  </form>;
}
