"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus, Pencil, Undo2, X } from "lucide-react";
import { saveFundChange } from "@/app/(app)/funds/actions";

interface Fund { id: string; name: string; description: string; is_active: boolean }
const titles: Record<string,string> = { create: "Create fund", edit: "Edit fund", manual_deposit: "Record deposit", manual_debit: "Record debit", reversal: "Reverse transaction" };
export function FundDialog({ operation, fund, reversalId, enabled = true }: { operation: keyof typeof titles; fund?: Fund; reversalId?: string; enabled?: boolean }) {
  const [open,setOpen] = useState(false);
  return <><button disabled={!enabled} title={titles[operation]} aria-label={titles[operation]} onClick={() => setOpen(true)} className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-40">
    {operation === "create" ? <Plus size={16} /> : operation === "edit" ? <Pencil size={16} /> : operation === "reversal" ? <Undo2 size={16} /> : null}
    {operation === "reversal" ? null : titles[operation]}</button>
    {open ? <FundForm operation={operation} fund={fund} reversalId={reversalId} onClose={() => setOpen(false)} /> : null}</>;
}
function FundForm({ operation,fund,reversalId,onClose }: { operation: string; fund?: Fund; reversalId?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reference] = useState(() => crypto.randomUUID());
  const [pending,startTransition] = useTransition();
  const [error,setError] = useState("");
  const account = operation === "create" || operation === "edit";
  useEffect(() => { ref.current?.showModal(); },[]);
  function submit(form: FormData) {
    setError("");
    startTransition(async () => {
      try { const result = await saveFundChange(operation,fund?.id ?? null,reference,form); if (result.error) setError(result.error); else onClose(); }
      catch { setError("Unable to save. Please try again."); }
    });
  }
  return <dialog ref={ref} aria-labelledby="fund-title" onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,560px)] overflow-y-auto rounded-lg border border-[#dfe4e1] bg-white p-0 text-[#19231d] shadow-xl backdrop:bg-black/40">
    <header className="flex items-center justify-between gap-3 border-b border-[#dfe4e1] p-5"><h2 id="fund-title" className="text-lg font-bold">{titles[operation]}</h2><button type="button" disabled={pending} onClick={onClose} title="Close" aria-label="Close" className="grid h-9 w-9 place-items-center"><X size={20} /></button></header>
    <PersistentForm action={submit} className="space-y-5 p-5"><fieldset disabled={pending} className="min-w-0 space-y-4">
      {account ? <>
        <label className="flex flex-col items-start gap-2 text-sm font-semibold">Fund name<input autoFocus name="name" required maxLength={120} defaultValue={fund?.name} className="h-10 w-80 max-w-full rounded-md border border-[#ccd4d0] px-3" /></label>
        <label className="flex flex-col items-start gap-2 text-sm font-semibold">Description<textarea name="description" defaultValue={fund?.description} maxLength={2000} rows={3} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3" /></label>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="active" defaultChecked={fund?.is_active ?? true} />Active fund</label>
      </> : <>
        {operation !== "reversal" ? <label className="flex flex-col items-start gap-2 text-sm font-semibold">Amount ($)<input autoFocus name="amount" type="number" min="0.01" step="0.01" required className="h-10 w-40 rounded-md border border-[#ccd4d0] px-3" /></label> : <input type="hidden" name="reversesId" value={reversalId} />}
        <label className="flex flex-col items-start gap-2 text-sm font-semibold">Reason / Source<textarea autoFocus={operation === "reversal"} name="reason" required minLength={5} maxLength={2000} rows={3} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3" /></label>
      </>}
    </fieldset>{error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <footer className="flex justify-end gap-2 border-t border-[#dfe4e1] pt-4"><button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Saving..." : "Save"}</button></footer>
    </PersistentForm>
  </dialog>;
}
