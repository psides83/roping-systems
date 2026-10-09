import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { activityMoney as money, memberActivityPage, type MemberActivity, type ActivitySeason, type ActivityQuery } from "@/lib/member-activity";
import { loadMemberQualificationActivity } from "@/lib/member-qualification-activity";
import { formatEntryLabel } from "@/lib/entry-labels";
import { loadMemberEntryChanges } from "@/lib/member-entry-activity";
import { calculateFinalRunTime, roundTime } from "@/lib/scoring";
import { qualifiedTimeLabel } from "@/lib/events/public-standings";

type Entry = { id: string; entry_number: number; entered_at: string; competition_status: string; payment_status: string;
  handicap_time_credit_seconds: number; event_id: string; event_roping_id: string;
  events: { title: string }; event_ropings: { name: string; scheduled_date: string; result_status: string; main_round_count: number };
  competition_runs: { id: string; round_number: number; status: string; raw_time_seconds: number | null; penalty_seconds: number; is_excluded: boolean }[] };
type ClassificationHistory = { id: string; effective_on: string; reason: string; ended_reason: string | null; assigned_by: string | null;
  previous_assignment_id: string | null; divisions: { name: string }; classifications: { name: string } };

export async function loadMemberActivity(memberId: string, query: ActivityQuery = {}) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const db = await createClient();
  const member = await db.from("memberships").select("id,roper_id").eq("producer_id", producer.id).eq("id", memberId).maybeSingle();
  if (member.error) throw new Error("Unable to load member activity.");
  if (!member.data) return null;
  const manager = producer.role !== "viewer";
  const finances = manager || producer.treasurer;
  const items: MemberActivity[] = [];
  const detailsHref = `/members/${memberId}`;
  const seasons = await readAllRows<ActivitySeason>((first, last) => db.from("producer_seasons").select("id,name,starts_on,ends_on")
    .eq("producer_id", producer.id).order("starts_on", { ascending: false }).order("id").range(first, last), "Unable to load activity seasons");
  // Query through the verified producer and shared roper identity, including entries made before membership linkage.
  const entries = await readAllRows<Entry>((first, last) => db.from("roping_entries")
    .select("id,entry_number,entered_at,competition_status,payment_status,handicap_time_credit_seconds,event_id,event_roping_id,events!inner(title),event_ropings!inner(name,scheduled_date,result_status,main_round_count),competition_runs(id,round_number,status,raw_time_seconds,penalty_seconds,is_excluded)")
    .eq("producer_id", producer.id).eq("roper_id", member.data!.roper_id).order("entered_at", { ascending: false }).order("id").range(first, last) as unknown as PromiseLike<{ data: Entry[] | null; error: { message: string } | null }>, "Unable to load activity entries");
  const charges = finances ? await readAllRows<{ entry_id: string | null; title: string; amount_cents: number; waived_at: string | null }>((first, last) => db.from("entry_charges")
    .select("entry_id,title,amount_cents,waived_at").eq("producer_id", producer.id).eq("roper_id", member.data!.roper_id).order("id").range(first, last), "Unable to load entry choices") : [];
  for (const entry of entries) {
    const label = `${entry.event_ropings.name} · ${entry.events.title}`;
    items.push({ id: `entry:${entry.id}`, type: "entry", occurredAt: entry.entered_at, title: "Roping entered", summary: label,
      details: [`Entry ${formatEntryLabel(entry.entry_number, producer.entryLabelStyle)}`, `Current entry status: ${entry.competition_status.replaceAll("_", " ")}`, `Payment status: ${entry.payment_status}`,
        ...charges.filter(charge => charge.entry_id === entry.id).map(charge => `${charge.title}: ${money(Number(charge.amount_cents))}${charge.waived_at ? " (waived)" : ""}`)],
      href: `/events/${entry.event_id}/entries` });
    const runs = entry.competition_runs.filter(run => !run.is_excluded && run.status !== "pending");
    if (runs.length) {
      const qualified = runs.filter(run => run.status === "complete" && run.raw_time_seconds !== null);
      const time = (run: typeof runs[number]) => calculateFinalRunTime(Number(run.raw_time_seconds), Number(run.penalty_seconds), Number(entry.handicap_time_credit_seconds));
      const aggregate = roundTime(qualified.reduce((sum, run) => sum + time(run), 0)).toFixed(2);
      items.push({ id: `result:${entry.id}`, type: "result", occurredAt: entry.event_ropings.scheduled_date, title: "Roping results",
        summary: `${label} · ${qualified.length ? `${aggregate} ${qualifiedTimeLabel(qualified.length).toLowerCase()}` : "No qualified times"}`,
        details: [`Entry ${formatEntryLabel(entry.entry_number, producer.entryLabelStyle)} · ${entry.event_ropings.result_status} results`, entry.competition_status !== "active" ? "Excluded from competition results" : "Active competition entry",
          ...runs.sort((a, b) => a.round_number - b.round_number).map(run => `${run.round_number > entry.event_ropings.main_round_count ? "Short round" : `Round ${run.round_number}`}: ${run.status === "complete" && run.raw_time_seconds !== null ? `${time(run).toFixed(2)} seconds` : run.status.replaceAll("_", " ")}`)], href: `/events/${entry.event_id}/live?roping=${entry.event_roping_id}` });
    }
  }
  if (manager) {
    const directory = await readAllRows<{ user_id: string; display_name: string | null; email: string }>((first, last) => db.from("producer_staff_directory")
      .select("user_id,display_name,email").eq("producer_id", producer.id).order("user_id").range(first, last), "Unable to load activity staff names");
    const staff = new Map(directory.map(row => [row.user_id, row.display_name || row.email]));
    items.push(...await loadMemberEntryChanges(db, producer.id, memberId, member.data.roper_id, staff));
    const history = await readAllRows<ClassificationHistory>((first, last) => db.from("membership_classification_history")
      .select("id,effective_on,reason,ended_reason,assigned_by,previous_assignment_id,divisions!inner(name),classifications!inner(name)").eq("producer_id", producer.id).eq("membership_id", memberId)
      .order("effective_on", { ascending: false }).order("id").range(first, last) as unknown as PromiseLike<{ data: ClassificationHistory[] | null; error: { message: string } | null }>, "Unable to load classification activity");
    for (const row of history) items.push({ id: `class:${row.id}`, type: "classification", occurredAt: row.effective_on, title: "Classification assigned",
      summary: `${row.previous_assignment_id ? `${history.find(previous => previous.id === row.previous_assignment_id)?.classifications.name ?? "Previous classification"} → ` : ""}${row.classifications.name} ${row.divisions.name}`,
      details: [row.reason, row.assigned_by ? `Recorded by ${staff.get(row.assigned_by) ?? "Former staff member"}` : "", row.ended_reason ? `Ended: ${row.ended_reason}` : ""].filter(Boolean), staffOnly: true,
      href: `${detailsHref}#classification-history-${row.id}` });
    const suspensions = await readAllRows<{ id: string; starts_on: string; ends_on: string; reason: string; created_at: string; staff_label: string; lifted_at: string | null; lift_reason: string | null; lifted_by_label: string | null }>((first, last) => db.from("membership_suspensions")
      .select("id,starts_on,ends_on,reason,created_at,staff_label,lifted_at,lift_reason,lifted_by_label").eq("producer_id", producer.id).eq("membership_id", memberId).order("created_at").order("id").range(first, last), "Unable to load suspension activity");
    for (const row of suspensions) {
      items.push({ id: `suspension:${row.id}`, type: "suspension", occurredAt: row.created_at, title: "Membership suspension issued", summary: `${row.starts_on} through ${row.ends_on}`,
        details: [row.reason, `Recorded by ${row.staff_label}`], staffOnly: true, href: detailsHref });
      if (row.lifted_at) items.push({ id: `lift:${row.id}`, type: "suspension", occurredAt: row.lifted_at, title: "Membership suspension lifted", summary: row.lift_reason ?? "Suspension lifted",
        details: [`Recorded by ${row.lifted_by_label}`], staffOnly: true, href: detailsHref });
    }
    const selectedSeason = seasons.find(season => season.id === query.season);
    items.push(...await loadMemberQualificationActivity(producer, memberId, selectedSeason ? [selectedSeason] : seasons));
  }
  if (finances) {
    const { loadMemberFinancialActivity } = await import("@/lib/member-financial-activity");
    items.push(...await loadMemberFinancialActivity(db, producer.id, memberId, member.data.roper_id));
    // Only calculate winnings for visible results; a long membership history must not rebuild every event purse.
    const visibleResults = memberActivityPage(items, seasons, producer.timezone, query).items.filter(item => item.type === "result");
    const visibleEntryIds = new Set(visibleResults.map(item => item.id.slice("result:".length)));
    for (const eventId of [...new Set(entries.filter(entry => visibleEntryIds.has(entry.id)).map(entry => entry.event_id))]) {
      const awards = await readAllRows<{ entry_id: string; roper_id: string; pool_name: string; section_type: string; round_number: number | null; place_number: number; payout_cents: number }>((first, last) => db.rpc("event_payout_register_awards", { target_event_id: eventId })
        .eq("roper_id", member.data!.roper_id).order("entry_id").order("plan_id").order("award_key").range(first, last), "Unable to load member winnings");
      for (const item of visibleResults) {
        const winnings = awards.filter(award => `result:${award.entry_id}` === item.id);
        item.details.push(...winnings.map(award => `${award.pool_name} · ${award.section_type === "go_round" ? `Round ${award.round_number}` : award.section_type.replaceAll("_", " ")} · Place ${award.place_number}: ${money(Number(award.payout_cents))}`));
      }
    }
  }
  return { items, seasons, timezone: producer.timezone };
}
