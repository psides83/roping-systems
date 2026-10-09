export interface SetupIssue { severity: "blocker" | "warning"; message: string; href: string }
export interface SetupRoping {
  id: string; name: string; date: string; arena: string | null; order: number;
  schedule: string; startsAt: string | null; payoutIssues: string[]; hasMainPayout: boolean;
}
export function setupReadiness(eventId: string, mode: "publish" | "start", dates: { first: string; last: string }, ropings: SetupRoping[], updates: { ropingId: string; dismissed: boolean | null; changes: unknown[] }[]): SetupIssue[] {
  const href = `/events/${eventId}`;
  const issues: SetupIssue[] = [];
  if (!ropings.length) issues.push({ severity: "blocker", message: "Add at least one roping to this event.", href });
  const ordered = [...ropings].sort((a, b) => a.order - b.order);
  for (const roping of ordered) {
    const add = (severity: SetupIssue["severity"], message: string) => issues.push({ severity, message: `${roping.name}: ${message}`, href });
    if (roping.date < dates.first || roping.date > dates.last) add("blocker", "scheduled outside the event dates.");
    if (roping.schedule === "fixed" && !roping.startsAt) add("blocker", "set a start time or choose tentative / follows previous.");
    if (roping.schedule === "tentative" && !roping.startsAt) add("warning", "tentative start time has not been provided.");
    if (roping.schedule === "follows_previous" && !ordered.some((previous) => previous.date === roping.date && previous.arena === roping.arena && previous.order < roping.order)) add("blocker", "no preceding roping in the same arena on this date.");
    if (!roping.hasMainPayout) add("warning", "no main payout schedule; confirm this is intentional (for example, a points-only roping).");
    for (const issue of roping.payoutIssues) add(mode === "start" ? "blocker" : "warning", issue);
    if (updates.some((update) => update.ropingId === roping.id && !update.dismissed && update.changes.length)) add("warning", "template changes await review. Update it or explicitly keep the current settings.");
    const start = roping.startsAt ? Date.parse(roping.startsAt) : null;
    if (roping.arena && start !== null && ordered.some((other) => other.id !== roping.id && other.arena === roping.arena && other.date === roping.date && other.startsAt && Date.parse(other.startsAt) === start)) add("warning", "another roping has the same arena and start time. Confirm the schedule.");
  }
  return issues;
}
