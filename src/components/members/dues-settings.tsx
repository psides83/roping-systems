"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { duesAction } from "@/app/(app)/members/dues/actions";
import type { DuesSettings } from "@/lib/membership-dues";
const field = "h-10 w-44 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
export function MembershipDuesSettings({ settings, funds, enabled, season }: { settings: DuesSettings | null; funds: { id: string; name: string }[]; enabled: boolean; season?: string }) {
  const [mode, setMode] = useState(settings?.allocation_mode ?? "fixed");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function submit(form: FormData) {
    setError(""); setMessage("");
    startTransition(async () => { try { const result = await duesAction("settings", "", form); if (result.error) setError(result.error); else setMessage("Dues settings saved. Existing seasonal charges are unchanged."); } catch { setError("Unable to save. Your edits are still here."); } });
  }
  return <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="space-y-5"><fieldset disabled={!enabled || pending} className="min-w-0 space-y-5"><input type="hidden" name="revision" value={settings?.revision ?? 0} /><input type="hidden" name="season" value={season ?? ""}/>
    <div className="flex flex-wrap items-end gap-4"><label className="grid gap-2 text-sm font-semibold">Seasonal dues ($)<input className={field} name="amount" inputMode="decimal" required defaultValue={settings ? (settings.amount_cents / 100).toFixed(2) : ""} /></label><label className="flex min-h-10 items-center gap-2 text-sm"><input name="installments" type="checkbox" defaultChecked={settings?.installments} />Allow installment payments</label></div>
    <h2 className="border-t border-[#d7ddda] pt-5 font-bold">Added-money contribution</h2>
    <div className="flex flex-wrap items-end gap-4"><label className="grid gap-2 text-sm font-semibold">Allocation<select name="mode" value={mode} onChange={(event) => setMode(event.target.value as "fixed" | "percent")} className={`${field} pr-9`}><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></select></label><label className="grid gap-2 text-sm font-semibold">{mode === "fixed" ? "Amount per membership ($)" : "Percentage of dues (%)"}<input key={mode} name="allocation" inputMode="decimal" required className={field} defaultValue={settings?.allocation_mode === mode ? (settings.allocation_value / 100).toFixed(2) : "0.00"} /></label><label className="grid gap-2 text-sm font-semibold">Default destination fund<select name="fund" defaultValue={settings?.fund_id ?? ""} className="h-10 w-64 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-3 pr-9 text-sm"><option value="">No contribution</option>{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label></div>
    <button disabled={!enabled || pending} className="brand-accent-fill inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-40"><Save size={16} />{pending ? "Saving..." : "Save settings"}</button>
  </fieldset>{error && <p role="alert" className="text-sm text-rose-800">{error}</p>}{message && <p role="status" className="text-sm text-emerald-800">{message}</p>}</form>;
}
