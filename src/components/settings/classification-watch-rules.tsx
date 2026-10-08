"use client";
import { NumberStepper } from "@/components/ui/number-stepper";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { addWatchStarter, deleteWatchRule, saveWatchRule, updateWatchSettings } from "@/app/(app)/settings/classification-watch/actions";
import type { WatchRule } from "@/lib/classification-watch";

type Classification = { id: string; name: string; division_id: string; divisions: { name: string } };
const field = "mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal";

export function ClassificationWatchRules({ rules, classifications, enabled, canEdit, canConfigure }: {
  rules: WatchRule[]; classifications: Classification[]; enabled: boolean; canEdit: boolean; canConfigure: boolean;
}) {
  const [editing, setEditing] = useState<WatchRule | "new" | null>(null);
  const [state, action, pending] = useActionState(updateWatchSettings, {});
  const [starter, starterAction, addingStarter] = useActionState(addWatchStarter, {});
  const divisions = [...new Map(classifications.map((c) => [c.division_id, { id: c.division_id, name: c.divisions.name }])).values()];
  return <section className="border-y border-[#dfe4e1] bg-white">
    <form action={action} className="flex flex-wrap items-center gap-4 border-b border-[#e7ebe8] p-5">
      <label className="flex items-center gap-2 text-sm font-semibold"><input name="enabled" type="checkbox" defaultChecked={enabled} disabled={!canConfigure} />Enable classification watch</label>
      <span className={`rounded px-2 py-1 text-xs font-semibold ${enabled ? "bg-emerald-50 text-emerald-800" : "bg-[#eef1ef] text-[#66716b]"}`}>{enabled ? "Enabled" : "Off"}</span>
      {canConfigure ? <button disabled={pending} className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><Save size={14} />{pending ? "Saving…" : "Save"}</button> : null}
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : state.success ? <p role="status" className="text-sm text-emerald-700">Saved</p> : null}
    </form>
    <header className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="font-bold">Fast-time rules</h2>
      {canEdit && classifications.length ? <button onClick={() => setEditing("new")} className="flex items-center gap-2 text-sm font-semibold"><Plus size={16} />Add rule</button> : null}
    </header>
    {canEdit && divisions.length ? <details className="px-5 pb-4"><summary className="cursor-pointer text-sm font-semibold text-[#66716b]">UCR starting rules</summary>
      <form action={starterAction} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Division<select name="divisionId" className={field}>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button disabled={addingStarter} className="h-10 rounded-md border px-3 text-sm font-semibold">{addingStarter ? "Adding…" : "Add starting rules"}</button>
        <p className="basis-full text-xs text-[#66716b]">#12: ≤10.00 · #11.5: &lt;10.25 · #11: ≤9.00 · #10: ≤8.00. Existing rules are kept. Watch stays off until enabled.</p>
        {starter.error ? <p role="alert" className="text-sm text-red-700">{starter.error}</p> : starter.success ? <p role="status" className="text-sm text-emerald-700">Starting rules added for matching classifications.</p> : null}
      </form>
    </details> : null}
    {editing ? <RuleForm key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? undefined : editing} classifications={classifications} onClose={() => setEditing(null)} /> : null}
    <div className="divide-y divide-[#e7ebe8]">{rules.map((rule) => <div key={rule.id} className="flex items-start justify-between gap-3 px-5 py-4">
      <div><p className="text-sm font-semibold">{rule.name} {!rule.is_active ? <span className="ml-2 text-xs text-[#758078]">Inactive</span> : null}</p>
        <p className="mt-1 text-xs text-[#66716b]">{classifications.find((c) => c.id === rule.classification_id)?.name} · {rule.inclusive ? "At or under" : "Under"} {Number(rule.threshold_seconds).toFixed(2)} sec · {rule.time_basis === "raw" ? "Timer time" : "Final time"} · Review at {rule.review_count} runs</p>
      </div>{canEdit ? <button title="Edit rule" aria-label={`Edit ${rule.name}`} onClick={() => setEditing(rule)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border"><Pencil size={15} /></button> : null}
    </div>)}</div>
    {!rules.length && !editing ? <p className="px-5 pb-5 text-sm text-[#758078]">No watch rules configured</p> : null}
  </section>;
}

function RuleForm({ rule, classifications, onClose }: { rule?: WatchRule; classifications: Classification[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveWatchRule, {});
  const [deletion, deleteAction, deleting] = useActionState(deleteWatchRule, {});
  const [classification, setClassification] = useState(rule?.classification_id ?? classifications[0]?.id ?? "");
  const division = classifications.find((c) => c.id === classification)?.division_id;
  useEffect(() => { if (state.success || deletion.success) onClose(); }, [state.success, deletion.success, onClose]);
  return <div className="disclosure-content space-y-3 border-y bg-[#f7f8f7] p-5">
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={rule?.id ?? ""} />
      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-semibold">Rule name<input className={field} name="name" required maxLength={100} defaultValue={rule?.name} /></label>
        <label className="text-sm font-semibold">Member classification<select className={field} name="classificationId" value={classification} onChange={(e) => setClassification(e.target.value)}>{classifications.map((c) => <option key={c.id} value={c.id}>{c.divisions.name} · {c.name}</option>)}</select></label>
        <label className="text-sm font-semibold">Fast-time threshold<input className={`${field} w-28`} name="threshold" type="number" step="0.01" min="0.01" required defaultValue={rule?.threshold_seconds} /></label>
        <label className="text-sm font-semibold">Time basis<select className={field} name="timeBasis" defaultValue={rule?.time_basis ?? "final"}><option value="final">Final time</option><option value="raw">Timer time, before penalties</option></select></label>
        <label className="text-sm font-semibold">Review after runs<NumberStepper label="Review after runs" className={`${field} w-24`} name="reviewCount" min="1" max="100" required defaultValue={rule?.review_count ?? 3} /></label>
        <label className="text-sm font-semibold">Suggested classification<select key={division} className={field} name="proposedId" defaultValue={rule?.division_id === division ? rule?.proposed_classification_id ?? "" : ""}><option value="">Staff decides</option>{classifications.filter((c) => c.division_id === division).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input name="inclusive" type="checkbox" defaultChecked={rule?.inclusive ?? true} />Include times equal to the threshold</label>
        <label className="flex items-center gap-2"><input name="active" type="checkbox" defaultChecked={rule?.is_active ?? true} />Active</label></div>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : null}
      <div className="flex gap-3"><button disabled={pending || deleting} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold disabled:opacity-50"><Save size={15} />{pending ? "Saving…" : "Save rule"}</button>
        <button type="button" onClick={onClose} className="px-3 text-sm font-semibold">Cancel</button></div>
    </form>
    {rule ? <form action={deleteAction} onSubmit={(e) => { if (!window.confirm("Delete this rule? Existing flags will remain in history.")) e.preventDefault(); }}>
      <input name="id" type="hidden" value={rule.id} /><button disabled={pending || deleting} className="flex items-center gap-2 text-sm font-semibold text-red-700"><Trash2 size={15} />{deleting ? "Deleting…" : "Delete rule"}</button>
      {deletion.error ? <p role="alert" className="mt-2 text-sm text-red-700">{deletion.error}</p> : null}
    </form> : null}
  </div>;
}
