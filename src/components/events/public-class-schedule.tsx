import type { PublicEvent } from "@/lib/events/public-event-data";
import { groupScheduleByArena } from "@/lib/events/arena-schedule";

export function PublicClassSchedule({
  events,
  live = false,
}: {
  events: PublicEvent["scheduledRopings"];
  live?: boolean;
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
      className={`${live ? "mt-6" : "mt-4"} space-y-5`}
    >
      {groupScheduleByArena(events, (roping) => roping.arenaName).map((group) => (
        <section key={group.name}>
          <h4 className="mb-2 text-xs font-bold uppercase text-[#56615b]">{group.name}</h4>
          <ol className="divide-y divide-[#e7ebe8] border-y border-[#e7ebe8]">
      {group.ropings.map((roping) => {
        const displayStart = roping.estimatedStartsAt ?? roping.startsAt;
        const startLabel = displayStart && !Number.isNaN(Date.parse(displayStart))
          ? new Intl.DateTimeFormat("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
            }).format(new Date(displayStart))
          : displayStart;
        return (
          <li
            key={roping.id}
            className="flex items-start justify-between gap-3 py-3 text-xs"
          >
            <span className="min-w-0 flex-1 font-semibold">
              <span className="block break-words">{roping.name}</span>
            </span>
            <span className="max-w-[60%] shrink-0 break-words text-right text-[#66716b]">
              <span className="block">
                {displayStart
                  ? `${roping.estimatedStartsAt ? "Updated " : ""}${startLabel}`
                  : `Follows ${roping.followsRopingName ?? "previous roping"}`}
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
