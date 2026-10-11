"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import {useActionState,useEffect,useRef,useState} from "react";
import {Plus,Pencil,Trash2,X} from "lucide-react";
import {saveExpense,type ExpenseState} from "@/app/(app)/events/[eventId]/profitability/actions";
import {expenseCategories,type EventExpense} from "@/lib/events/profitability";
import {formatCurrency} from "@/lib/utils";

export function EventExpenses({eventId,expenses,ropings}:{eventId:string;expenses:EventExpense[];ropings:{id:string;name:string}[]}) {
  const [editing,setEditing]=useState<EventExpense|null|undefined>();
  return <section className="border-t pt-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Expenses</h2><button onClick={()=>setEditing(null)} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><Plus size={16}/>Add expense</button></div>
    {!expenses.length?<p className="py-6 text-sm text-[#66716b]">No expenses recorded yet.</p>:<ul className="mt-3 divide-y">{expenses.map(expense=><li key={expense.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{expenseCategories[expense.category]} <span className="ml-2 font-normal text-[#66716b]">{ropings.find(row=>row.id===expense.event_roping_id)?.name??"Shared event expense"}</span></p>{expense.note&&<p className="mt-1 break-words text-sm text-[#66716b]">{expense.note}</p>}</div><strong className="text-sm tabular-nums">{formatCurrency(Number(expense.amount_cents))}</strong><button onClick={()=>setEditing(expense)} aria-label={`Edit ${expenseCategories[expense.category]} expense`} title="Edit expense" className="flex h-9 w-9 items-center justify-center rounded-md border"><Pencil size={16}/></button></li>)}</ul>}
    {editing!==undefined&&<ExpenseDialog key={editing?.id??"new"} eventId={eventId} expense={editing} ropings={ropings} close={()=>setEditing(undefined)}/>}
  </section>;
}
function ExpenseDialog({eventId,expense,ropings,close}:{eventId:string;expense:EventExpense|null;ropings:{id:string;name:string}[];close:()=>void}) {
  const [id]=useState(()=>expense?.id??crypto.randomUUID());
  const [state,action,pending]=useActionState<ExpenseState,FormData>(saveExpense.bind(null,eventId),{});
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{if(state.success)close();},[state.success,close]);
  const field="h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
  return <dialog ref={dialog} onCancel={event=>{if(pending)event.preventDefault();else close();}} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-lg p-5 backdrop:bg-black/40" aria-labelledby="expense-heading"><div className="mb-4 flex items-center justify-between"><h2 id="expense-heading" className="text-lg font-bold">{expense?"Edit expense":"Add expense"}</h2><button type="button" onClick={close} disabled={pending} aria-label="Close expense dialog" className="flex h-9 w-9 items-center justify-center"><X size={20}/></button></div>
    <PersistentForm action={action} className="space-y-4"><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={expense?.revision??0}/><fieldset disabled={pending} className="flex flex-wrap gap-3"><label className="grid gap-1 text-sm font-semibold">Category<select name="category" defaultValue={expense?.category??"arena"} className={`${field} w-44`}>{Object.entries(expenseCategories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Amount<input name="amount" inputMode="decimal" required defaultValue={expense?(Number(expense.amount_cents)/100).toFixed(2):""} placeholder="0.00" className={`${field} w-32`}/></label><label className="grid gap-1 text-sm font-semibold">Applies to<select name="ropingId" defaultValue={expense?.event_roping_id??""} className={`${field} w-64`}><option value="">Whole event</option>{ropings.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="grid w-full gap-1 text-sm font-semibold">Note (optional)<textarea name="note" maxLength={500} rows={2} defaultValue={expense?.note??""} className="rounded-md border p-2 text-sm"/></label></fieldset>
      {state.message&&!state.success&&<p role="alert" className="text-sm text-rose-700">{state.message}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <button type="button" onClick={close} disabled={pending} className="h-10 rounded-md border px-3 text-sm font-semibold">Cancel</button>
        <button name="operation" value="save" disabled={pending} className="h-10 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">{pending?"Saving…":"Save expense"}</button>
        {expense&&<button name="operation" value="remove" disabled={pending} onClick={event=>{if(!window.confirm("Remove this expense from totals? Its record remains in the changelog."))event.preventDefault();}} className="order-first mr-auto inline-flex h-10 items-center gap-2 px-2 text-sm font-semibold text-rose-700"><Trash2 size={16}/>Remove</button>}
      </div>
    </PersistentForm></dialog>;
}
