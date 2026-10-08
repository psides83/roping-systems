"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays, shiftMonth } from "@/lib/list-controls";

interface CalendarItem { id: string; title: string; start: string; end: string; card: ReactNode }
export function PublicScheduleViews({ events, today, children }: { events: CalendarItem[]; today: string; children: ReactNode }) {
  const [view, setView] = useState("list");
  const [month, setMonth] = useState(() => {
    const current = today.slice(0, 7);
    return events.some((event) => event.start.slice(0, 7) <= current && event.end.slice(0, 7) >= current)
      ? current : events.find((event) => event.end >= today)?.start.slice(0, 7) ?? current;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const control = "flex h-11 w-fit max-w-full items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold";
  const onDay = (event: CalendarItem, date: string) => event.start <= date && event.end >= date;
  const visible = events.filter((event) => selected ? onDay(event, selected) : event.start.slice(0, 7) <= month && event.end.slice(0, 7) >= month);
  const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  function changeMonth(value: string) { setMonth(value); setSelected(null); }
  return <div className="mt-4 space-y-5">
    <div className="inline-flex rounded-md border border-[#d7ddda] bg-white p-1">{[{ value: "list", label: "List", icon: List }, { value: "calendar", label: "Calendar", icon: CalendarDays }].map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold ${view === value ? "bg-[#eef1ef]" : "text-[#66716b]"}`}><Icon size={16}/>{label}</button>)}</div>
    {view === "list" ? children : <div className="space-y-6">
      <section className="overflow-hidden rounded-md border border-[#d7ddda] bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-[#d7ddda] p-3 sm:p-4"><button type="button" aria-label="Previous month" className={control} onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft size={17}/></button><h2 className="text-base font-bold">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</h2><button type="button" aria-label="Next month" className={control} onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight size={17}/></button><button type="button" className={control} onClick={() => { changeMonth(today.slice(0, 7)); setSelected(today); }}>Today</button><input aria-label="Calendar month" type="month" value={month} onChange={(event) => { if (event.target.value) changeMonth(event.target.value); }} className="h-11 w-44 max-w-full rounded-md border border-[#d7ddda] px-3 text-sm"/></header>
        <div className="grid grid-cols-7">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="border-b border-[#d7ddda] py-2 text-center text-[11px] font-semibold text-[#66716b]">{day}</span>)}{calendarDays(month).map((date, index) => {
          const daily = date ? events.filter((event) => onDay(event, date)) : [];
          return date ? <button key={date} type="button" aria-pressed={date === selected} aria-label={`${dateLabel(date)}, ${daily.length} ${daily.length === 1 ? "event" : "events"}`} onClick={() => setSelected(date)} className={`flex min-h-20 min-w-0 flex-col items-center gap-1 border-b border-r border-[#e7ebe8] p-1 text-left hover:bg-[#f5f6f7] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-accent)] sm:min-h-28 sm:items-start sm:p-2 ${date === selected ? "bg-[#eef1ef] ring-2 ring-inset ring-[var(--brand-accent)]" : ""}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${date === today ? "brand-accent-fill text-white" : ""}`}>{Number(date.slice(-2))}</span>{daily.slice(0, 2).map((event) => <span key={event.id} className="hidden w-full truncate rounded bg-[#eef1ef] px-1.5 py-1 text-[11px] font-semibold sm:block">{event.title}</span>)}{!!daily.length && <span className="rounded bg-[#eef1ef] px-1 py-0.5 text-[10px] font-semibold sm:hidden">{daily.length}<span className="sr-only"> events</span></span>}{daily.length > 2 && <span className="hidden text-[10px] text-[#66716b] sm:block">+{daily.length - 2} more</span>}</button> : <div key={`blank-${index}`} className="min-h-20 border-b border-r border-[#e7ebe8] bg-[#fafbfa] sm:min-h-28"/>;
        })}</div>
      </section>
      <section aria-live="polite" className="space-y-5"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold">{selected ? dateLabel(selected) : "Events this month"}</h2>{selected && <button type="button" className={control} onClick={() => setSelected(null)}>All this month</button>}<span className="text-xs text-[#66716b]">{visible.length} {visible.length === 1 ? "event" : "events"}</span></div>{visible.map((event) => <div key={event.id}>{event.card}</div>)}{!visible.length && <p className="border-t border-[#d7ddda] py-8 text-sm text-[#66716b]">No scheduled events {selected ? "on this date" : "this month"}.</p>}</section>
    </div>}
  </div>;
}
