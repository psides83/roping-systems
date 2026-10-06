export function eventDateRange(startsAt: string, endsAt?: string | null, timezone = "America/Chicago") {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : start;
  if (Number.isNaN(start.getTime())) return startsAt;
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: timezone,
  });
  if (Number.isNaN(end.getTime()) || end < start || formatter.format(start) === formatter.format(end)) {
    return formatter.format(start);
  }
  return formatter.formatRange(start, end);
}
