import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { WaitlistControls, type WaitlistRow } from "./waitlist-controls";

export async function RopingWaitlists({ eventId, manager }: { eventId: string; manager: boolean }) {
  const db = await createClient();
  const ropings = await readAllRows<{ id: string; name: string; scheduled_date: string; entry_limit: number | null; event_day_status: string }>((first,last) => db.from("event_ropings").select("id,name,scheduled_date,entry_limit,event_day_status").eq("event_id",eventId).order("sort_order").order("id").range(first,last), "Unable to load entry limits");
  const entries = await readAllRows<{event_roping_id:string}>((first,last) => db.from("roping_entries").select("event_roping_id").eq("event_id",eventId).eq("competition_status","active").order("id").range(first,last), "Unable to load capacity");
  const rows = await readAllRows<WaitlistRow>((first,last) => db.from("roping_waitlist").select("id,event_roping_id,status,revision,note,guest,ropers(first_name,last_name,phone,email)").eq("event_id",eventId).order("created_at").order("id").range(first,last) as unknown as PromiseLike<{data:WaitlistRow[]|null;error:{message:string}|null}>, "Unable to load waitlists");
  return <section className="border-y py-4"><details><summary className="cursor-pointer font-bold">Entry limits &amp; waitlists · {rows.filter(row=>["waiting","offered"].includes(row.status)).length} waiting or offered</summary><div className="mt-4 space-y-4">{ropings.map(roping=><WaitlistControls key={roping.id} eventId={eventId} roping={roping} count={entries.filter(entry=>entry.event_roping_id===roping.id).length} rows={rows.filter(row=>row.event_roping_id===roping.id)} manager={manager}/>)}</div></details></section>;
}
