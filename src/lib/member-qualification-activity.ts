import "server-only";
import type { ActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { loadFinalsAssignments } from "@/lib/events/finals-assignment-data";
import { finalsPositionSlots } from "@/lib/finals-position-assignments";
import type { MemberActivity, ActivitySeason } from "@/lib/member-activity";

export async function loadMemberQualificationActivity(producer: ActiveProducer, memberId: string, seasons: ActivitySeason[]) {
  const items: MemberActivity[] = [];
  const db = await createClient();
  const classifications = await readAllRows<{ id: string; name: string; division_id: string; divisions: { name: string } }>((first, last) => db.from("classifications")
    .select("id,name,division_id,divisions!inner(name)").eq("producer_id", producer.id).order("id").range(first, last) as unknown as PromiseLike<{ data: { id: string; name: string; division_id: string; divisions: { name: string } }[] | null; error: { message: string } | null }>, "Unable to load qualification classifications");
  const names = new Map(classifications.map(row => [row.id, `${row.name} ${row.divisions.name}`]));
  for (const row of classifications) {
    names.set(`${row.division_id}:handicap`, `Handicap ${row.divisions.name}`);
    names.set(`${row.division_id}:four_d`, `4-D ${row.divisions.name}`);
  }
  const manual = await readAllRows<{ id: string; awarded_on: string; reason: string; positions: number; revoked: boolean; revoke_reason: string | null; season_id: string }>((first, last) => db.from("manual_finals_positions")
    .select("id,awarded_on,reason,positions,revoked,revoke_reason,season_id").eq("producer_id", producer.id).eq("membership_id", memberId).order("id").range(first, last), "Unable to load manual position activity");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const season of seasons) {
    const data = await loadFinalsQualifications(producer.slug, season.id);
    const awards = data.awards.filter(award => award.memberId === memberId);
    const slots = finalsPositionSlots(awards, await loadFinalsAssignments(producer.id, season.id), season.ends_on, today);
    for (const award of awards) {
      const manualSource = manual.find(row => `manual:${row.id}` === award.id);
      const finish = data.finishes.find(row => row.entryId === award.entryId);
      const rule = data.rules.find(row => row.id === award.ruleId);
      const positionSlots = slots.filter(slot => slot.awardId === award.id);
      items.push({ id: `qualification:${award.id}`, type: "qualification", occurredAt: manualSource?.awarded_on ?? finish?.date ?? season.starts_on,
        title: "Bonus positions earned", summary: `${award.positions} extra ${award.positions === 1 ? "entry" : "entries"} · ${names.get(award.classId) ?? "Classification unavailable"} · ${season.name}`,
        details: [`Earned for ${names.get(award.earnedClassId) ?? "Classification unavailable"}`, award.revoked ? "Current status: revoked" : `Current status: ${[...new Set(positionSlots.map(slot => slot.status.replaceAll("_", " ")))].join(", ")}`,
          manualSource?.reason ?? `Qualifying ${rule?.stage.replaceAll("_", " ") ?? "finish"} · Place ${award.place}`, ...positionSlots.map(slot => `Position ${slot.number}: ${slot.status.replaceAll("_", " ")}`)],
        staffOnly: true, seasonId: season.id, href: `/settings/finals?season=${season.id}` });
      for (const slot of positionSlots) if (slot.assignment?.assigned_at) items.push({ id: `qualification-assignment:${slot.assignment.id}`, type: "qualification",
        occurredAt: slot.assignment.assigned_at, title: "Bonus position assigned", summary: `Position ${slot.number} · ${season.name}`,
        details: [slot.assignment.reason, `Current status: ${slot.status.replaceAll("_", " ")}`], staffOnly: true, seasonId: season.id,
        href: `/settings/finals?season=${season.id}` });
    }
    for (const source of manual.filter(row => row.season_id === season.id && !awards.some(award => award.id === `manual:${row.id}`))) {
      items.push({ id: `manual:${source.id}`, type: "qualification", occurredAt: source.awarded_on, title: "Manual bonus positions",
        summary: `${source.positions} extra entries · ${source.revoked ? "revoked" : season.name}`, details: [source.reason, source.revoke_reason ?? ""].filter(Boolean),
        staffOnly: true, seasonId: season.id, href: `/settings/finals?season=${season.id}` });
    }
  }
  return items;
}
