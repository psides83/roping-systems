import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { MemberActivity } from "@/lib/member-activity";

interface EntrySnapshot { roper_id?: string; event_id?: string; event_roping_id?: string; competition_status?: string }
export async function loadMemberEntryChanges(db: Awaited<ReturnType<typeof createClient>>, producerId: string, memberId: string, roperId: string, staff: Map<string, string>) {
  const rows = await readAllRows<{ id: number; actor_user_id: string | null; action: string; created_at: string; before_data: EntrySnapshot | null; after_data: EntrySnapshot | null }>((first, last) => db.from("producer_audit_log")
    .select("id,actor_user_id,action,created_at,before_data,after_data").eq("producer_id", producerId).eq("entity_type", "roping_entries").neq("action", "insert")
    .or(`before_data->>roper_id.eq.${roperId},after_data->>roper_id.eq.${roperId}`)
    .order("created_at", { ascending: false }).order("id").range(first, last), "Unable to load entry change activity");
  const items: MemberActivity[] = [];
  for (const row of rows) {
    if (row.action === "insert") continue;
    const before = row.before_data;
    const after = row.after_data;
    const transferred = before?.event_roping_id !== after?.event_roping_id && row.action === "update";
    const statusChanged = before?.competition_status !== after?.competition_status && row.action === "update";
    if (row.action !== "delete" && !transferred && !statusChanged) continue;
    const event = after?.event_id ?? before?.event_id;
    items.push({ id: `entry-change:${row.id}`, type: "entry", occurredAt: row.created_at,
      title: row.action === "delete" ? "Entry removed" : transferred ? "Entry transferred" : "Entry status changed",
      summary: statusChanged ? `${before?.competition_status?.replaceAll("_", " ")} → ${after?.competition_status?.replaceAll("_", " ")}` : transferred ? "Entry moved to another roping" : "Entry removed from the event",
      details: [`Recorded by ${row.actor_user_id ? staff.get(row.actor_user_id) ?? "Former staff member" : "System"}`],
      staffOnly: true, href: event ? `/events/${event}/entries` : `/members/${memberId}` });
  }
  return items;
}
