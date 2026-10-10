import Link from "next/link";
import { notFound } from "next/navigation";
import { StockChargeDesk } from "@/components/events/stock-charge-desk";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";

export default async function StockChargePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const event = await db.from("events").select("id,title,starts_at,ends_at,arena_count").eq("id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (!event.data) notFound();
  const permissions: Record<string, boolean> = {};
  for (const [name, rpc] of Object.entries({ manage: "can_manage_event", collect: "can_collect_event", office: "can_enter_event", correct: "can_adjust_event_finances", finance: "can_finance_event" })) {
    const result = await db.rpc(rpc, { target_event: eventId });
    if (result.error) throw new Error("Unable to check stock charge access.");
    permissions[name] = Boolean(result.data);
  }
  if (!permissions.manage && !permissions.office && !permissions.finance) notFound();
  const settings = await db.from("event_stock_settings").select("enabled,run_limit,score_limit").eq("event_id", eventId).maybeSingle();
  if (settings.error) throw new Error("Unable to load stock charge settings.");
  const packages = await readAllRows((first, last) => db.from("event_stock_packages").select("*").eq("event_id", eventId).order("id").range(first,last), "Load stock packages");
  const sessions = await readAllRows((first,last) => db.from("event_stock_sessions").select("*").eq("event_id",eventId).order("scheduled_date").order("id").range(first,last), "Load stock sessions");
  const purchases = await readAllRows((first,last) => db.from("event_stock_purchases").select("*").eq("event_id",eventId).order("created_at",{ascending:false}).order("id").range(first,last), "Load stock purchases");
  const payments = await readAllRows((first,last) => db.from("event_stock_payments").select("*").eq("event_id",eventId).order("id").range(first,last), "Load stock payments");
  const uses = await readAllRows((first,last) => db.from("event_stock_uses").select("*").eq("event_id",eventId).order("created_at").order("id").range(first,last), "Load stock usage");
  const memberships = await readAllRows((first,last) => db.from("memberships").select("member_number,ropers!inner(id,first_name,last_name,phone)").eq("producer_id",producer.id).order("id").range(first,last), "Load ropers");
  const ropers = memberships.flatMap(m => (Array.isArray(m.ropers) ? m.ropers : [m.ropers]).map(r => ({ ...r, member_number:m.member_number })));
  const ropings = await readAllRows((first,last) => db.from("event_ropings").select("id,name,scheduled_date,arena_name").eq("event_id",eventId).order("sort_order").order("id").range(first,last), "Load ropings");
  const dateInZone = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  const dates: string[] = [];
  const end = dateInZone(event.data.ends_at ?? event.data.starts_at);
  for (let date=dateInZone(event.data.starts_at); date<=end; date=new Date(new Date(`${date}T12:00:00Z`).getTime()+86400000).toISOString().slice(0,10)) dates.push(date);
  return <div className="space-y-6"><PageHeader eyebrow="Event workspace" title="Stock charge runs" description={event.data.title} actions={<Link href={`/events/${eventId}`} className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold">Event dashboard</Link>} /><StockChargeDesk eventId={eventId} settings={settings.data} packages={packages} sessions={sessions} purchases={purchases} payments={payments} uses={uses} ropers={ropers} ropings={ropings} dates={dates} arenas={Array.from({length:event.data.arena_count},(_,i)=>`Arena ${i+1}`)} manage={permissions.manage} collect={permissions.collect} office={permissions.office || permissions.manage} correct={permissions.correct} /></div>;
}
