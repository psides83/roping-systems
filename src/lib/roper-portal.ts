import type { EntryLabelStyle } from "./entry-labels";

export interface PortalEntry {
  id: string; number: number; paymentStatus: string; competitionStatus: string;
  ropingId: string; ropingName: string; division: string | null; date: string;
  eventTitle: string; eventSlug: string; public: boolean; status: string; resultStatus: string;
}
export interface PortalMembership {
  id: string; memberNumber: string; status: string; expiresOn: string | null;
  producerName: string; producerSlug: string; today: string; entryLabelStyle: EntryLabelStyle;
  classifications: { name: string; division: string }[]; entries: PortalEntry[];
}
export function groupPortalEntries(entries: PortalEntry[], today: string) {
  const upcoming: PortalEntry[] = [];
  const past: PortalEntry[] = [];
  for (const entry of entries) {
    const active = entry.competitionStatus === "active";
    const finished = entry.status === "completed" || entry.status === "cancelled";
    (active && !finished && (entry.date >= today || entry.status === "in_progress") ? upcoming : past).push(entry);
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  past.sort((a, b) => b.date.localeCompare(a.date) || a.number - b.number);
  return { upcoming, past };
}
export function portalResultsLink(membership: PortalMembership, entry: PortalEntry) {
  if (!entry.public) return null;
  const query = new URLSearchParams({ event: entry.eventSlug, roping: entry.ropingId });
  return `/public/${encodeURIComponent(membership.producerSlug)}?${query}`;
}
