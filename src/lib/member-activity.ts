export const activityTypes = {
  entry: "Entries", result: "Results", classification: "Classifications", dues: "Dues",
  fine: "Fines", suspension: "Suspensions", qualification: "Qualifications", payout: "Payouts",
} as const;
export type ActivityType = keyof typeof activityTypes;
export interface MemberActivity {
  id: string;
  type: ActivityType;
  occurredAt: string;
  title: string;
  summary: string;
  details: string[];
  href: string;
  staffOnly?: boolean;
  seasonId?: string;
}
export interface ActivitySeason { id: string; name: string; starts_on: string; ends_on: string }
export interface ActivityQuery { type?: string; season?: string; from?: string; to?: string; page?: string }

export function activityDate(value: string, timezone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function memberActivityPage(items: MemberActivity[], seasons: ActivitySeason[], timezone: string,
  query: ActivityQuery) {
  const validDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value ? value : undefined;
  const type = query.type && Object.hasOwn(activityTypes, query.type) ? query.type : "all";
  const season = seasons.find(item => item.id === query.season);
  const from = validDate(query.from);
  const to = validDate(query.to);
  const error = from && to && from > to ? "The end date must be on or after the start date." : "";
  const filtered = error ? [] : items.filter(item => {
    const date = activityDate(item.occurredAt, timezone);
    return (type === "all" || item.type === type) && (!from || date >= from) && (!to || date <= to)
      && (!season || (item.seasonId ? item.seasonId === season.id : date >= season.starts_on && date <= season.ends_on));
  }).sort((a, b) => activityDate(b.occurredAt, timezone).localeCompare(activityDate(a.occurredAt, timezone))
    || b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const requested = Number(query.page ?? 1);
  const page = Math.min(pageCount, Number.isInteger(requested) && requested > 0 ? requested : 1);
  return { items: filtered.slice((page - 1) * 30, page * 30), total: filtered.length, page, pageCount, type,
    season: season?.id ?? "all", from, to, error };
}

export const activityMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
