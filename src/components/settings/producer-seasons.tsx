"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { deleteProducerSeason, saveProducerSeason } from "@/app/(app)/settings/season-actions";
import type { ProducerSeason } from "@/lib/seasons";
import { publicEventDate } from "@/lib/events/public-event-navigation";

const field = "mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";

export function ProducerSeasons({ seasons, canEdit }: { seasons: ProducerSeason[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<ProducerSeason | "new" | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return <section>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-bold">Seasons</h3>
      {canEdit ? <button type="button" onClick={() => { setEditing("new"); setMessage(""); }} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold"><Plus size={15} /> Add season</button> : null}
    </header>
    <ul className="mt-3 divide-y divide-[#e7ebe8]">
      {seasons.map((season) => <li key={season.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{season.name}</p><p className="mt-1 text-xs text-[#66716b]">{publicEventDate(season.startsOn)} - {publicEventDate(season.endsOn)}</p></div>
        {canEdit ? <div className="flex gap-2">
          <button type="button" onClick={() => { setEditing(season); setMessage(""); }} aria-label={`Edit ${season.name}`} title="Edit season" className="grid h-9 w-9 place-items-center rounded-md border border-[#ccd4d0]"><Pencil size={15} /></button>
          <button type="button" disabled={pending} onClick={() => {
            if (!window.confirm(`Delete ${season.name}? Event records and results will remain, but this season filter will be removed.`)) return;
            startTransition(async () => { const result = await deleteProducerSeason(season.id); setMessage(result.message ?? ""); if (result.success) setEditing(null); });
          }} aria-label={`Delete ${season.name}`} title="Delete season" className="grid h-9 w-9 place-items-center rounded-md border border-[#ccd4d0] text-rose-700 disabled:opacity-50"><Trash2 size={15} /></button>
        </div> : null}
      </li>)}
    </ul>
    {!seasons.length ? <p className="mt-3 text-sm text-[#66716b]">No seasons configured.</p> : null}
    {message ? <p role="alert" className="mt-3 text-sm text-rose-700">{message}</p> : null}
    {editing !== null ? <SeasonForm key={editing === "new" ? "new" : editing.id} season={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
  </section>;
}

function SeasonForm({ season, onClose }: { season?: ProducerSeason; onClose: () => void }) {
  const [state, action, pending] = useActionState(saveProducerSeason, {});
  useEffect(() => { if (state.success) onClose(); }, [state.success, onClose]);
  return <form action={action} className="mt-4 border-t border-[#e7ebe8] pt-4">
    <input type="hidden" name="id" value={season?.id ?? ""} />
    <h4 className="mb-3 text-sm font-bold">{season ? "Edit season" : "Add season"}</h4>
    <div className="flex flex-wrap items-end gap-3">
      <label className="max-w-full text-xs font-semibold">Season name<input name="name" defaultValue={season?.name} required maxLength={80} placeholder="2026-2027" className={`${field} w-56`} /></label>
      <label className="max-w-full text-xs font-semibold">Start date<input name="startsOn" type="date" defaultValue={season?.startsOn} required className={field} /></label>
      <label className="max-w-full text-xs font-semibold">End date<input name="endsOn" type="date" defaultValue={season?.endsOn} required className={field} /></label>
    </div>
    {state.message && !state.success ? <p role="alert" className="mt-3 text-sm text-rose-700">{state.message}</p> : null}
    <div className="mt-3 flex gap-2">
      <button disabled={pending} className="inline-flex h-9 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold disabled:opacity-50">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Save season</button>
      <button type="button" disabled={pending} onClick={onClose} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold"><X size={15} /> Cancel</button>
    </div>
  </form>;
}
