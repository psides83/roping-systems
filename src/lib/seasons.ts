export const seasonMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function seasonStartYear(value: string, startMonth: number, timezone: string): number | null {
  if (Number.isNaN(Date.parse(value))) return null;
  const parts = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) }
    : Object.fromEntries(new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", timeZone: timezone }).formatToParts(new Date(value)).map((part) => [part.type, Number(part.value)]));
  return parts.year - (parts.month < startMonth ? 1 : 0);
}

export function seasonLabel(year: number, startMonth: number): string {
  if (startMonth === 1) return String(year);
  return `${seasonMonths[startMonth - 1].slice(0, 3)} ${year} - ${seasonMonths[startMonth - 2].slice(0, 3)} ${year + 1}`;
}

export function browseResultEvents<T extends { status: string; startsAt: string; title: string; venue: string; address: string }>(
  events: T[], search: string, season: string, startMonth: number, timezone: string, oldestFirst: boolean,
) {
  const matches = (event: T) => `${event.title} ${event.venue} ${event.address} ${event.startsAt}`.toLowerCase().includes(search.trim().toLowerCase());
  const live = events.filter((event) => event.status === "in_progress" && matches(event));
  const past = events.filter((event) => event.status === "completed" && matches(event)
    && (season === "all" || String(seasonStartYear(event.startsAt, startMonth, timezone)) === season));
  past.sort((a, b) => (Date.parse(a.startsAt) - Date.parse(b.startsAt)) * (oldestFirst ? 1 : -1));
  return { live, past };
}
