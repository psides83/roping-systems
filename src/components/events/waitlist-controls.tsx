"use client";
import { useActionState } from "react";
import { Check, Send, X, Save } from "lucide-react";
import { resolveWaitlist, setEntryLimit, type WaitlistState } from "@/app/(app)/events/[eventId]/entries/waitlist-actions";
import { formatPhoneNumber } from "@/lib/utils";

export interface WaitlistRow {
  id:string;event_roping_id:string;status:string;revision:number;note:string;
  guest:{firstName:string;lastName:string;phone?:string;email?:string}|null;
  ropers:{first_name:string;last_name:string;phone:string|null;email:string|null}|null;
}
const button="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold disabled:opacity-50";
const name=(row:WaitlistRow)=>row.ropers?`${row.ropers.first_name} ${row.ropers.last_name}`:`${row.guest?.firstName??"Guest"} ${row.guest?.lastName??""}`;

export function WaitlistControls({eventId,roping,count,rows,manager}:{eventId:string;roping:{id:string;name:string;scheduled_date:string;entry_limit:number|null;event_day_status:string};count:number;rows:WaitlistRow[];manager:boolean}) {
  const [state,action,pending]=useActionState<WaitlistState,FormData>(setEntryLimit.bind(null,eventId),{});
  const active=rows.filter(row=>["waiting","offered"].includes(row.status));
  const offers=active.filter(row=>row.status==="offered").length;
  const available=roping.entry_limit===null||count+offers<roping.entry_limit;
  const next=active.find(row=>row.status==="waiting")?.id;
  const complete=roping.event_day_status==="completed";
  return <details className="border-b pb-4"><summary className="cursor-pointer text-sm font-semibold">{roping.name} · {roping.scheduled_date}<span className="ml-2 font-normal text-[#66716b]">{count}{roping.entry_limit!==null?` / ${roping.entry_limit}`:" accepted"} · {active.length} waitlisted · {offers} reserved</span></summary><div className="mt-4 space-y-3">
    {manager&&<form action={action} className="flex flex-wrap items-end gap-2"><input type="hidden" name="ropingId" value={roping.id}/><label className="grid gap-1 text-xs font-semibold">Entry limit<input name="limit" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={roping.entry_limit??""} placeholder="Unlimited" disabled={pending||complete} className="h-9 w-28 rounded-md border px-3"/></label><button className={button} disabled={pending||complete}><Save size={15}/>{pending?"Saving…":"Save"}</button><span aria-live="polite" className="text-sm">{state.message}</span></form>}
    {!active.length&&<p className="text-sm text-[#66716b]">No contestants waiting.</p>}
    {active.map((row,index)=><WaitlistItem key={`${row.id}:${row.revision}`} eventId={eventId} row={row} position={index+1} canOffer={available&&row.id===next} complete={complete}/>)}
    {!!rows.filter(row=>!["waiting","offered"].includes(row.status)).length&&<details><summary className="cursor-pointer text-sm">Resolved entries</summary><ul className="mt-2 space-y-2 text-sm">{rows.filter(row=>!["waiting","offered"].includes(row.status)).map(row=><li key={row.id}>{name(row)} · {row.status}{row.note?` · ${row.note}`:""}</li>)}</ul></details>}
  </div></details>;
}
function WaitlistItem({eventId,row,position,canOffer,complete}:{eventId:string;row:WaitlistRow;position:number;canOffer:boolean;complete:boolean}) {
  const [state,action,pending]=useActionState<WaitlistState,FormData>(resolveWaitlist.bind(null,eventId),{});
  const phone=row.ropers?.phone??row.guest?.phone;
  const email=row.ropers?.email??row.guest?.email;
  return <form action={action} className="flex flex-wrap items-center gap-3 border-t py-3"><input type="hidden" name="id" value={row.id}/><input type="hidden" name="revision" value={row.revision}/><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{position}. {name(row)} <span className="ml-2 text-xs text-[#66716b]">{row.status==="offered"?"Space offered · reserved":"Waiting"}</span></p><div className="mt-1 flex flex-wrap gap-3 text-xs text-[#66716b]">{phone&&<a href={`tel:${phone}`}>{formatPhoneNumber(phone)}</a>}{email&&<a href={`mailto:${email}`} className="break-all">{email}</a>}</div></div>
    <input name="note" placeholder="Staff note / decline reason" maxLength={500} disabled={pending||complete} className="h-9 w-56 max-w-full rounded-md border px-3 text-sm"/>
    {row.status==="waiting"?<button className={button} name="decision" value="offer" disabled={pending||!canOffer||complete}><Send size={15}/>Offer space</button>:<button className={button} name="decision" value="accept" disabled={pending||complete}><Check size={15}/>Confirm acceptance</button>}
    <button className={button} name="decision" value={row.status==="offered"?"decline":"cancel"} disabled={pending||complete}><X size={15}/>{row.status==="offered"?"Decline":"Remove"}</button>
    {pending&&<p role="status" className="w-full text-sm">Updating waitlist…</p>}{state.message&&<p aria-live="polite" className="w-full text-sm text-rose-700">{state.message}</p>}
  </form>;
}
