export function selectPublicEvent<T extends { slug: string; status: string }>(
  events: T[],
  requestedSlug?: string,
): T | null {
  if (requestedSlug) return events.find((event) => event.slug === requestedSlug) ?? null;
  return events.find((event) => event.status === "in_progress")
    ?? events.find((event) => event.status === "completed")
    ?? null;
}

export function publicEventHref(producerSlug: string, eventSlug: string) {
  return `/public/${encodeURIComponent(producerSlug)}?event=${encodeURIComponent(eventSlug)}#results`;
}

export function publicEventDate(value: string) {
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  return Number.isNaN(Date.parse(timestamp)) ? value : new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium", timeZone: "America/Chicago",
  }).format(new Date(timestamp));
}
