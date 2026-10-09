import type { NotificationItem } from "./notifications";
import type { FinalsPositionSlot } from "./finals-position-assignments";
import { roperBonusPositions, type RoperBonusSource } from "./roper-bonus-positions";

export function staffBonusNotification(producerId: string, season: { id: string; name: string; starts_on: string }, slots: FinalsPositionSlot[], issues: { ruleId: string; place: number; reason: string }[]): NotificationItem[] {
  const unresolved = slots.filter(slot => slot.status === "pending" || slot.status === "needs_review");
  if (!unresolved.length && !issues.length) return [];
  return [{ id: `bonus:staff:${producerId}:${season.id}`, category: "bonus", title: "Bonus positions need attention",
    body: `${season.name} · ${unresolved.filter(slot => slot.status === "pending").length} pending assignments · ${unresolved.filter(slot => slot.status === "needs_review").length} assignments need review · ${issues.length} unresolved qualifying placements.`,
    href: `/settings/finals?season=${season.id}`, created_at: `${season.starts_on}T12:00:00Z`,
    revision: JSON.stringify([unresolved.map(slot => [slot.awardId, slot.number, slot.classId, slot.status, slot.targetId]).sort(), issues.map(issue => [issue.ruleId, issue.place, issue.reason]).sort()]) }];
}
export function roperBonusNotifications(data: RoperBonusSource, producerSlug: string): NotificationItem[] {
  if (!data.season) return [];
  const slots = roperBonusPositions(data);
  const awards = [...new Set(slots.map(slot => slot.awardId))];
  return awards.map(awardId => {
    const positions = slots.filter(slot => slot.awardId === awardId);
    const slot = positions[0];
    const statuses = [...new Set(positions.map(position => position.status))];
    const date = slot.sourceRoping?.date ?? data.season!.startsOn;
    return { id: `bonus:roper:${data.memberId}:${awardId}`, category: "bonus", title: "Earned bonus positions",
      body: `${slot.className} · ${positions.length} extra ${positions.length === 1 ? "entry" : "entries"} · ${statuses.map(status => ({ pending: "pending producer assignment", assigned: "assigned to a roping", expired: "expired", needs_review: "producer review needed" })[status]).join("; ")}. Entry fees and eligibility rules still apply.`,
      href: `/roper?producer=${encodeURIComponent(producerSlug)}&view=bonus&season=${data.season!.id}`,
      created_at: positions.map(position => position.assignment?.assigned_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? `${date}T12:00:00Z`,
      revision: JSON.stringify(positions.map(position => [position.number, position.classId, position.status, position.targetId]).sort()) };
  });
}
