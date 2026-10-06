"use client";

export function PublicScheduleJump({ events }: { events: Array<{ id: string; label: string }> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm font-semibold">
        Jump to event
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) window.location.hash = `event-${event.target.value}`;
          }}
          className="h-10 w-80 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal outline-none focus:border-[var(--brand-accent)]"
        >
          <option value="" disabled>Choose an event</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}
        </select>
      </label>
      <span className="text-xs text-[#66716b]">{events.length} scheduled events</span>
    </div>
  );
}
