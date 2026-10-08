import type { PublicEvent } from "@/lib/events/public-event-data";
import { groupScheduleByArena } from "@/lib/events/arena-schedule";
import { qualificationNoticeText } from "@/lib/events/qualification-notice";

export function PublicClassSchedule({
  events,
  live = false,
  columns = false,
  timezone = "America/Chicago",
  timeOnly = false,
}: {
  events: PublicEvent["scheduledRopings"];
  live?: boolean;
  columns?: boolean;
  timezone?: string;
  timeOnly?: boolean;
}) {
  const statusLabels: Record<string, string> = {
    scheduled: "Scheduled",
    delayed: "Delayed",
    holding: "Holding",
    in_progress: "In progress",
    completed: "Completed",
  };

  return (
    <div
      className={`${live ? "mt-6" : "mt-4"} ${columns ? "grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3" : "space-y-5"}`}
    >
      {groupScheduleByArena(events, (roping) => roping.arenaName).map((group) => (
        <section key={group.name}>
          <h4 className="mb-2 text-xs font-bold uppercase text-[#56615b]">{group.name}</h4>
          <ol className="divide-y divide-[#e7ebe8] border-y border-[#e7ebe8]">
      {group.ropings.map((roping) => {
        const displayStart = roping.estimatedStartsAt ?? roping.startsAt;
        const startLabel = displayStart && !Number.isNaN(Date.parse(displayStart))
          ? new Intl.DateTimeFormat("en-US", {
              ...(timeOnly ? {} : { weekday: "short" as const, month: "short" as const, day: "numeric" as const }),
              hour: "numeric", minute: "2-digit", timeZone: timezone,
            }).format(new Date(displayStart))
          : displayStart;
        return (
          <li
            key={roping.id}
            className="space-y-1 py-3 text-sm"
          >
            <span className="block min-w-0 font-semibold">
              <span className="block break-words">{roping.name}</span>
              {roping.qualification ? <span className="mt-1 block font-normal leading-5 text-[#66716b]">{qualificationNoticeText(roping.qualification)}</span> : null}
            </span>
            <span className="block min-w-0 break-words text-xs leading-5 text-[#66716b]">
              <span className="block">
                {displayStart
                  ? `${roping.estimatedStartsAt ? "Updated " : ""}${startLabel}`
                  : roping.scheduleType === "follows_previous" ? `Follows ${roping.followsRopingName ?? "previous roping"}` : "Start time to be announced"}
                {!roping.estimatedStartsAt &&
                roping.scheduleType === "tentative"
                  ? " tentative"
                  : ""}
              </span>
              {roping.eventDayStatus !== "scheduled" ? (
                <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 font-bold text-amber-800">
                  {statusLabels[roping.eventDayStatus] ?? roping.eventDayStatus}
                </span>
              ) : null}
              {(roping.eventDayNote ?? roping.scheduleNote) ? (
                <span className="mt-1 block max-w-64 text-[10px]">
                  {roping.eventDayNote ?? roping.scheduleNote}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
          </ol>
        </section>
      ))}
    </div>
  );
}
