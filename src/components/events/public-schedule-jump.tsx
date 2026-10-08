"use client";

export function PublicScheduleJump({ events, months = [] }: { events: Array<{ id: string; label: string }>; months?: Array<{ id: string; label: string }> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {months.length > 1 ? <label className="max-w-full text-xs font-semibold">Month
        <select aria-label="Jump to month" defaultValue="" onChange={(event) => { if (event.target.value) window.location.hash = `month-${event.target.value}`; }} className="mt-1 block h-11 w-48 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal">
          <option value="" disabled>Choose a month</option>
          {months.map((month) => <option key={month.id} value={month.id}>{month.label}</option>)}
        </select>
      </label> : null}
      <label className="block min-w-0 max-w-full text-xs font-semibold">
        Jump to event
        <select
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) window.location.hash = `event-${event.target.value}`;
          }}
          className="mt-1 block h-11 w-80 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal outline-none focus:border-[var(--brand-accent)]"
        >
          <option value="" disabled>Choose an event</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.label}</option>)}
        </select>
      </label>
      <span className="text-xs text-[#66716b]">{events.length} scheduled events</span>
    </div>
  );
}
