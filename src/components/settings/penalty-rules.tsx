"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, Save } from "lucide-react";
import { savePenalty } from "@/app/(app)/settings/timing/penalty-actions";
import { formatAgeRange, type PenaltyRule } from "@/lib/penalties";
type Choice = { id: string; name: string };
export function PenaltyRules({ rules, divisions, classifications, canEdit }: {
  rules: PenaltyRule[]; divisions: Choice[]; classifications: (Choice & { division_id: string })[]; canEdit: boolean;
}) {
  const [editing, setEditing] = useState<PenaltyRule | "new" | null>(null);
  return <section className="border-y border-[#dfe4e1] bg-white">
    <header className="flex items-center justify-between gap-3 p-5"><h2 className="font-bold">Penalty rules</h2>
      {canEdit && divisions.length ? <button onClick={() => setEditing("new")} className="flex items-center gap-2 text-sm font-semibold"><Plus size={16} />Add penalty</button> : null}</header>
    {editing ? <PenaltyForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? undefined : editing}
      divisions={divisions} classifications={classifications} onClose={() => setEditing(null)} /> : null}
    <div className="divide-y divide-[#e7ebe8]">{rules.map((rule) => <div key={rule.id} className="flex items-start justify-between gap-4 px-5 py-4">
      <div><p className="text-sm font-semibold">{rule.name} <span className="ml-2 font-mono">+{Number(rule.seconds).toFixed(2)}s</span>
        {!rule.is_active ? <span className="ml-2 rounded bg-[#eef1ef] px-2 py-1 text-xs text-[#66716b]">Inactive</span> : null}</p>
        <p className="mt-1 text-xs text-[#66716b]">{divisions.find((d) => d.id === rule.division_id)?.name}
          {rule.classification_mode !== "all" ? ` · ${rule.classification_mode === "only" ? "Only" : "Except"} ropings: ${classifications.filter((c) => rule.classification_ids.includes(c.id)).map((c) => c.name).join(", ")}` : " · All classifications"}
          {rule.age_mode !== "all" ? ` · ${rule.age_mode === "only" ? "Only" : "Except"} ${formatAgeRange(rule.minimum_age, rule.maximum_age).toLowerCase()}` : " · All ages"}</p>
      </div>{canEdit ? <button aria-label={`Edit ${rule.name}`} title={`Edit ${rule.name}`} onClick={() => setEditing(rule)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border"><Pencil size={15} /></button> : null}
    </div>)}</div>{!rules.length && !editing ? <p className="px-5 pb-5 text-sm text-[#758078]">No penalties configured</p> : null}
  </section>;
}
function PenaltyForm({ rule, divisions, classifications, onClose }: {
  rule?: PenaltyRule; divisions: Choice[]; classifications: (Choice & { division_id: string })[]; onClose: () => void;
}) {
  const [state, action, pending] = useActionState(savePenalty, {});
  const [division, setDivision] = useState(rule?.division_id ?? divisions[0]?.id ?? "");
  const [classMode, setClassMode] = useState(rule?.classification_mode ?? "all");
  const [ageMode, setAgeMode] = useState(rule?.age_mode ?? "all");
  useEffect(() => { if (state.success) onClose(); }, [state.success, onClose]);
  const field = "mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal";
  return <PersistentForm action={action} className="disclosure-content space-y-4 border-y border-[#dfe4e1] bg-[#f7f8f7] p-5">
    <input type="hidden" name="id" value={rule?.id ?? ""} />
    <div className="flex flex-wrap gap-4">
      <label className="text-sm font-semibold">Name<input name="name" defaultValue={rule?.name} required maxLength={80} className={field} /></label>
      <label className="text-sm font-semibold">Seconds<input name="seconds" type="number" min="0.01" max="999" step="0.01" defaultValue={rule?.seconds} required className={`${field} w-24`} /></label>
      <label className="text-sm font-semibold">Division<select name="divisionId" value={division} onChange={(e) => setDivision(e.target.value)} className={field}>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap items-start gap-6">
      <div><label className="text-sm font-semibold">Classifications<select name="classificationMode" value={classMode} onChange={(e) => setClassMode(e.target.value as typeof classMode)} className={field}>
        <option value="all">All classifications</option><option value="only">Only selected</option><option value="except">Except selected</option></select></label>
        {classMode !== "all" ? <div key={division} className="mt-3 flex max-w-md flex-wrap gap-3">{classifications.filter((c) => c.division_id === division).map((c) => <label key={c.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="classificationId" value={c.id} defaultChecked={rule?.classification_ids.includes(c.id)} />{c.name}</label>)}</div> : null}
      </div>
      <div><label className="text-sm font-semibold">Ages<select name="ageMode" value={ageMode} onChange={(e) => setAgeMode(e.target.value as typeof ageMode)} className={field}>
        <option value="all">All ages</option><option value="only">Only this age range</option><option value="except">Except this age range</option></select></label>
        {ageMode !== "all" ? <div className="mt-3 flex flex-wrap gap-3">{[["minimumAge", "Minimum", rule?.minimum_age], ["maximumAge", "Maximum", rule?.maximum_age]].map(([name, label, value]) => <label key={String(name)} className="text-xs font-semibold">{label}
          <input name={String(name)} type="number" min="0" max="120" defaultValue={value ?? ""} className={`${field} w-24`} /></label>)}</div>
          : <><input type="hidden" name="minimumAge" value="" /><input type="hidden" name="maximumAge" value="" /></>}
      </div>
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={rule?.is_active ?? true} />Active</label>
    {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
    <div className="flex gap-3"><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold disabled:opacity-50"><Save size={15} />{pending ? "Saving…" : "Save penalty"}</button>
      <button type="button" onClick={onClose} className="px-3 text-sm font-semibold">Cancel</button></div>
  </PersistentForm>;
}
