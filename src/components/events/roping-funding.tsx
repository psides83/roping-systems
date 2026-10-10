"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Pencil, X, LoaderCircle, LockKeyhole, Undo2 } from "lucide-react";
import { changeRopingFunding } from "@/app/(app)/events/funding-actions";
import { formatCurrency } from "@/lib/utils";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

export interface FundingRecord { id: string; source: string; fund_id: string | null; sponsor_name: string; amount_cents: number; received_cents: number; reason: string; cancelled_at: string | null }
export interface FundingAccount { id: string; name: string; available_cents: number; is_active: boolean }
interface Props { ropingId: string; records: FundingRecord[]; funds: FundingAccount[]; pledged: boolean; finalized: boolean; completed: boolean; canManage: boolean }
const control = "h-10 w-60 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
export function RopingFunding(props: Props) {
  const [dialog, setDialog] = useState<{ operation: string; record?: FundingRecord } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const total = props.records.filter(r => !r.cancelled_at).reduce((sum,r) => sum + (r.source === "sponsor" && !props.pledged ? r.received_cents : r.amount_cents),0);
  function policy(form: FormData) {
    setError(""); startTransition(async () => { try { const result = await changeRopingFunding(props.ropingId,"policy","",form); if (result.error) setError(result.error); } catch { setError("Unable to save. Please try again."); } });
  }
  return <section className="space-y-4 border-t border-[#e7ebe8] p-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Added money <span className="ml-2 font-mono">{formatCurrency(total)}</span></h3><p className="mt-1 text-xs text-[#66716b]">{props.finalized ? "Payouts finalized" : "Payouts not finalized"}</p></div>
      {props.canManage ? <div className="flex flex-wrap gap-2">{!props.finalized ? <button className={control + " !w-auto"} onClick={() => setDialog({operation:"save"})}><Plus className="mr-2 inline" size={16}/>Add money</button> : null}
        <button disabled={!props.finalized && !props.completed} className={control + " !w-auto disabled:opacity-40"} onClick={() => setDialog({operation:props.finalized ? "reopen" : "finalize"})}>{props.finalized ? <Undo2 className="mr-2 inline" size={16}/> : <LockKeyhole className="mr-2 inline" size={16}/>}{props.finalized ? "Reopen payouts" : "Finalize payouts"}</button></div> : null}</header>
    <div className="divide-y divide-[#e7ebe8]">{props.records.map(r => <div key={r.id} className="flex items-start justify-between gap-3 py-3"><div className={r.cancelled_at ? "opacity-50" : ""}><p className="text-sm font-semibold">{r.source === "fund" ? props.funds.find(f => f.id === r.fund_id)?.name ?? "Fund" : r.source === "sponsor" ? r.sponsor_name : "External added money"} · {formatCurrency(r.amount_cents)}{r.cancelled_at ? " · Cancelled" : ""}</p><p className="mt-1 text-xs text-[#66716b]">{r.source === "fund" ? props.finalized ? "Debited from fund" : "Reserved in fund" : r.source === "sponsor" ? `${formatCurrency(r.received_cents)} received / ${formatCurrency(r.amount_cents-r.received_cents)} pledged` : "Received"}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-[#66716b]">{r.reason}</p></div>
      {props.canManage && !r.cancelled_at && (!props.finalized || (r.source === "sponsor" && props.pledged && r.received_cents < r.amount_cents)) ? <button title="Edit contribution" aria-label="Edit contribution" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#ccd4d0]" onClick={() => setDialog({operation:"save",record:r})}><Pencil size={16}/></button> : null}</div>)}</div>
    <form action={policy} className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input name="pledged" type="checkbox" defaultChecked={props.pledged} key={String(props.pledged)} disabled={!props.canManage || props.finalized || pending}/>Include pledged sponsor money in payouts</label>{props.canManage && !props.finalized ? <button disabled={pending} className="text-sm font-semibold text-[var(--brand-accent-strong)]">{pending ? "Saving..." : "Save policy"}</button> : null}</form>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    {dialog ? <FundingDialog {...props} {...dialog} onClose={() => setDialog(null)}/> : null}
  </section>;
}
function FundingDialog({operation,record,onClose,...props}: Props & {operation: string; record?: FundingRecord; onClose: () => void}) {
  const fundsEnabled = featureEnabled(useProducerFeatures(), "funds");
  const ref = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => record?.id ?? crypto.randomUUID());
  const [source,setSource] = useState(record?.source ?? (fundsEnabled ? "fund" : "sponsor"));
  const [pending,startTransition] = useTransition();
  const [error,setError] = useState("");
  const [cancel,setCancel] = useState(false);
  useEffect(() => { ref.current?.showModal(); },[]);
  function submit(form: FormData) { setError(""); startTransition(async () => { try { const result = await changeRopingFunding(props.ropingId,cancel ? "cancel" : operation,reference,form); if (result.error) setError(result.error); else onClose(); } catch { setError("Unable to save. Please try again."); } }); }
  const title = operation === "save" ? record ? "Edit added money" : "Add money" : operation === "finalize" ? "Finalize payouts" : "Reopen payouts";
  return <dialog ref={ref} aria-labelledby="funding-title" onCancel={e => {if (pending) e.preventDefault(); else onClose();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40"><header className="flex items-center justify-between border-b border-[#dfe4e1] p-5"><h2 id="funding-title" className="text-lg font-bold">{title}</h2><button disabled={pending} onClick={onClose} title="Close" aria-label="Close"><X size={20}/></button></header>
    <form action={submit} className="space-y-4 p-5"><fieldset disabled={pending} className="min-w-0 space-y-4">
      {operation === "save" ? <>
        <label className="flex flex-col items-start gap-2 text-sm font-semibold">Source<select name="source" value={source} onChange={e => setSource(e.target.value)} className={control} disabled={props.finalized}>{(fundsEnabled || record?.source === "fund") && <option value="fund">Producer fund</option>}<option value="sponsor">Sponsor</option><option value="other">Other external money</option></select></label>
        {props.finalized ? <input type="hidden" name="source" value={source}/> : null}
        {source === "fund" ? <label className="flex flex-col items-start gap-2 text-sm font-semibold">Fund<select name="fund" required defaultValue={record?.fund_id ?? ""} className={control}><option value="">Choose a fund</option>{props.funds.filter(f => f.is_active || f.id === record?.fund_id).map(f => <option key={f.id} value={f.id}>{f.name} · {formatCurrency(Number(f.available_cents))} available</option>)}</select></label> : null}
        {source === "sponsor" ? <label className="flex flex-col items-start gap-2 text-sm font-semibold">Sponsor<input name="sponsor" required maxLength={200} readOnly={props.finalized} defaultValue={record?.sponsor_name} className={control}/></label> : null}
        <div className="flex flex-wrap gap-4"><label className="flex flex-col items-start gap-2 text-sm font-semibold">{source === "sponsor" ? "Committed amount ($)" : "Amount ($)"}<input name="amount" type="number" required min="0.01" step="0.01" readOnly={props.finalized} defaultValue={record ? (record.amount_cents/100).toFixed(2) : undefined} className={control + " !w-40"}/></label>
          {source === "sponsor" ? <label className="flex flex-col items-start gap-2 text-sm font-semibold">Received ($)<input name="received" type="number" required min={props.finalized && record ? record.received_cents/100 : 0} step="0.01" defaultValue={((record?.received_cents ?? 0)/100).toFixed(2)} className={control + " !w-40"}/></label> : null}</div>
        {record && !props.finalized ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cancel} onChange={e => setCancel(e.target.checked)}/>Cancel this contribution</label> : null}
      </> : <p className="text-sm text-[#66716b]">{operation === "finalize" ? "Finalizing locks results and payout settings and debits reserved fund money. Payout receipts can then be recorded." : "Reopening returns fund money and restores its reservation. Recorded payouts must be reversed first."}</p>}
      <label className="flex flex-col items-start gap-2 text-sm font-semibold">Reason<textarea name="reason" required minLength={5} maxLength={2000} defaultValue={operation === "save" ? record?.reason : undefined} rows={3} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3"/></label>
    </fieldset>{error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<footer className="flex justify-end gap-2 border-t border-[#dfe4e1] pt-4"><button type="button" disabled={pending} onClick={onClose} className={control + " !w-auto"}>Cancel</button><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">{pending ? <LoaderCircle size={16} className="animate-spin"/> : null}{pending ? "Saving..." : cancel ? "Cancel contribution" : "Confirm"}</button></footer></form>
  </dialog>;
}
