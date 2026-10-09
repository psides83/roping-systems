"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Wallet, Undo2, X, LoaderCircle } from "lucide-react";
import { duesAction } from "@/app/(app)/members/dues/actions";
import { duesTotals, duesContribution, nonnegativeMoney, type DuesAccount, type DuesSettings } from "@/lib/membership-dues";
import { formatCurrencyExact as formatCurrency } from "@/lib/utils";

type Choice = { id: string; name: string; is_active?: boolean };
interface Props {
  operation: "assess" | "payment" | "reversal"; account?: DuesAccount; reversalId?: string;
  members?: Choice[]; seasons?: Choice[]; funds?: Choice[]; settings?: DuesSettings | null; season?: string; member?: string;
}
const input = "h-10 w-44 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
const select = "h-10 w-72 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-3 pr-9 text-sm";
const titles = { assess: "Add seasonal dues", payment: "Record dues payment", reversal: "Reverse dues payment" };
export function DuesDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const Icon = props.operation === "assess" ? Plus : props.operation === "payment" ? Wallet : Undo2;
  return <><button onClick={() => setOpen(true)} title={titles[props.operation]} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><Icon size={16} />{props.operation === "reversal" ? "Reverse" : titles[props.operation]}</button>{open && <DuesForm {...props} onClose={() => setOpen(false)} />}</>;
}
function DuesForm({ operation, account, reversalId, members = [], seasons = [], funds = [], settings, season, member, onClose }: Props & { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState(member ?? "");
  const balance = account ? duesTotals([account]).outstanding : 0;
  const [amountText, setAmountText] = useState((balance / 100).toFixed(2));
  const amount = nonnegativeMoney(amountText);
  const paid = account ? duesTotals([account]).collected : 0;
  const contribution = account && amount !== null && amount <= balance
    ? duesContribution(paid + amount, Number(account.amount_cents), Number(account.allocation_cents)) - duesContribution(paid, Number(account.amount_cents), Number(account.allocation_cents)) : null;
  const choices = members.filter((item) => item.id === selectedMember || item.name.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { ref.current?.showModal(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []);
  function submit(form: FormData) {
    setError("");
    startTransition(async () => { try { const result = await duesAction(operation, reference, form); if (result.error) setError(result.error); else onClose(); } catch { setError("Unable to save. Your information is still here; retry when connected."); } });
  }
  return <dialog ref={ref} aria-label={titles[operation]} onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }} className="m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-md border border-[#d7ddda] bg-white p-5 text-[#17201c] shadow-xl backdrop:bg-black/45"><header className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{titles[operation]}</h2><button disabled={pending} type="button" title="Close" aria-label="Close" onClick={onClose} className="grid h-10 w-10 place-items-center"><X size={20} /></button></header>
    <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="space-y-5"><fieldset disabled={pending} className="min-w-0 space-y-4">
      {operation === "assess" ? <><p className="text-sm font-semibold">{formatCurrency(Number(settings?.amount_cents ?? 0))} per season · {settings?.installments ? "Installments allowed" : "Full payment required"}</p><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Find member<input value={query} onChange={(event) => setQuery(event.target.value)} type="search" className={select} /></label><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Member<select required name="member" value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className={select}><option value="">Choose a member</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Season<select required name="season" defaultValue={season ?? ""} className={select}><option value="">Choose a season</option>{seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{Number(settings?.allocation_value) > 0 && <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Contribution destination<select required name="fund" defaultValue={settings?.fund_id ?? ""} className={select}><option value="">Choose a fund</option>{funds.filter((item) => item.is_active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === settings?.fund_id ? " (default)" : ""}</option>)}</select></label>}</> : <>
        <input name="dues" type="hidden" value={account?.id} />
        {operation === "payment" ? <><p className="text-sm font-semibold">Outstanding: {formatCurrency(balance)}</p><div className="flex flex-wrap gap-4"><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Payment ($)<input name="amount" required inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} readOnly={!account?.installments} className={input} /></label><label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">Method<select name="method" className={`${input} pr-9`}><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card (received)</option><option value="other">Other</option></select></label></div>{account?.fund_id && contribution !== null && <p className="text-sm text-[#66716b]">Fund contribution from this payment: {formatCurrency(contribution)}</p>}</> : <><input name="reverses" type="hidden" value={reversalId} /><p className="text-sm">This reverses the recorded payment and its fund contribution. The original record stays in the history.</p></>}
        <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-start gap-2 text-sm font-semibold">{operation === "reversal" ? "Reason for reversal" : "Payment note / Reference"}<textarea name="reason" required minLength={5} maxLength={2000} rows={3} defaultValue={operation === "payment" ? "Membership dues payment" : ""} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3 text-sm" /></label>
      </>}
    </fieldset>{error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<footer className="flex justify-end gap-2 border-t border-[#d7ddda] pt-4"><button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border px-4 text-sm font-semibold">Cancel</button><button disabled={pending} className="brand-accent-fill inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white">{pending && <LoaderCircle size={16} className="animate-spin" />}{pending ? "Saving..." : operation === "assess" ? "Add dues" : operation === "reversal" ? "Confirm reversal" : "Record payment"}</button></footer></form>
  </dialog>;
}
