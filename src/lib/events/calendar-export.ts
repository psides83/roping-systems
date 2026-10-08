export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location: string;
  timezone: string;
  url: string;
}

export function calendarDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(new Date(value));
}

export function calendarEventDates(event: CalendarEvent) {
  const start = calendarDate(event.startsAt, event.timezone);
  const end = event.endsAt && Date.parse(event.endsAt) >= Date.parse(event.startsAt)
    ? calendarDate(event.endsAt, event.timezone) : start;
  // Calendar DATE end values are exclusive; include the final event day.
  const exclusiveEnd = new Date(`${end}T12:00:00Z`);
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  return { start, end, exclusiveEnd: exclusiveEnd.toISOString().slice(0, 10) };
}

function description(event: CalendarEvent) {
  return `Event dates in ${event.timezone}. Check the public schedule for individual roping start times and updates.\n${event.url}\nThis saved calendar event does not automatically update when the schedule changes.`;
}

export function googleCalendarUrl(event: CalendarEvent) {
  const dates = calendarEventDates(event);
  const query = new URLSearchParams({ action: "TEMPLATE", text: event.title,
    dates: `${dates.start.replaceAll("-", "")}/${dates.exclusiveEnd.replaceAll("-", "")}`,
    location: event.location, details: description(event), ctz: event.timezone });
  return `https://calendar.google.com/calendar/render?${query}`;
}

function escapeText(value: string) {
  return value.replaceAll("\\", "\\\\").replace(/\r\n|\r|\n/g, "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
}

function foldLine(value: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let line = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { lines.push(line); line = " "; bytes = 1; }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join("\r\n");
}

export function calendarFile(event: CalendarEvent, now = new Date()) {
  const dates = calendarEventDates(event);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Roping Systems//Public Events//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${event.id.replace(/[^a-zA-Z0-9-]/g, "-")}@roping-systems`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dates.start.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${dates.exclusiveEnd.replaceAll("-", "")}`,
    `SUMMARY:${escapeText(event.title)}`, `LOCATION:${escapeText(event.location)}`, `DESCRIPTION:${escapeText(description(event))}`,
    "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR"].map(foldLine).join("\r\n") + "\r\n";
}
