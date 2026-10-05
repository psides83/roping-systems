export interface ProducerSeason {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export function seasonCalendarDate(value: string, timezone: string): string | null {
  if (Number.isNaN(Date.parse(value))) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function eventSeason(value: string, seasons: ProducerSeason[], timezone: string): ProducerSeason | undefined {
  const date = seasonCalendarDate(value, timezone);
  return date ? seasons.find((season) => date >= season.startsOn && date <= season.endsOn) : undefined;
}

export function browseResultEvents<T extends { status: string; startsAt: string; title: string; venue: string; address: string }>(
  events: T[], search: string, season: string, seasons: ProducerSeason[], timezone: string, oldestFirst: boolean,
) {
  const matches = (event: T) => `${event.title} ${event.venue} ${event.address} ${event.startsAt}`.toLowerCase().includes(search.trim().toLowerCase());
  const live = events.filter((event) => event.status === "in_progress" && matches(event));
  const past = events.filter((event) => event.status === "completed" && matches(event)
    && (season === "all" || (season === "unassigned" ? !eventSeason(event.startsAt, seasons, timezone) : eventSeason(event.startsAt, seasons, timezone)?.id === season)));
  past.sort((a, b) => (Date.parse(a.startsAt) - Date.parse(b.startsAt)) * (oldestFirst ? 1 : -1));
  return { live, past };
}
