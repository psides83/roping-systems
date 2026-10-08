"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Calendar, List, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { RopingSummary } from "@/types/domain";
import { calendarDays, matchesSearch, shiftMonth } from "@/lib/list-controls";

type EventItem = RopingSummary & { startsOn?: string; endsOn?: string };
export function EventBrowser({ events, rows }: { events: EventItem[]; rows: ReactNode[] }) {
  const [view, setView] = useState("list");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [publication, setPublication] = useState("");
  const [sort, setSort] = useState("latest");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const items = events.map((event, index) => ({ event, index, start: event.startsOn ?? (Number.isNaN(Date.parse(event.date)) ? "" : new Date(event.date).toISOString().slice(0, 10)) }));
  const filtered = items.filter(({ event }) => matchesSearch([event.title, event.location], search) && (!status || event.status === status) && (!publication || (event.publicationState ?? "draft") === publication)).sort((a, b) => sort === "name" ? a.event.title.localeCompare(b.event.title) : (sort === "latest" ? -1 : 1) * a.start.localeCompare(b.start));
  const control = "h-10 max-w-full rounded-md border border-[#d7ddda] bg-white px-3 text-sm";
  const inDay = (start: string, event: EventItem, date: string) => start <= date && (event.endsOn ?? start) >= date;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-md border border-[#d7ddda] bg-white p-1">{[{ value: "list", icon: List, label: "List" }, { value: "calendar", icon: Calendar, label: "Calendar" }].map(({ value, icon: Icon, label }) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)} className={`flex h-8 items-center gap-2 rounded px-3 text-xs font-semibold ${view === value ? "bg-[#eef1ef]" : "text-[#66716b]"}`}><Icon size={15}/>{label}</button>)}</div>
      <label className={`${control} flex w-64 items-center gap-2`}><Search size={16}/><input aria-label="Search events" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events or location" className="min-w-0 flex-1 outline-none"/></label>
      <select aria-label="Event status" value={status} onChange={(event) => setStatus(event.target.value)} className={control}><option value="">All statuses</option>{[...new Set(events.map((event) => event.status))].sort().map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select>
      <select aria-label="Publication status" value={publication} onChange={(event) => setPublication(event.target.value)} className={control}><option value="">All publication states</option><option value="draft">Draft</option><option value="published">Published</option><option value="unpublished">Unpublished</option></select>
      {view === "list" && <select aria-label="Sort events" value={sort} onChange={(event) => setSort(event.target.value)} className={control}><option value="latest">Latest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option></select>}
      {(search || status || publication) && <button type="button" className={control} onClick={() => { setSearch(""); setStatus(""); setPublication(""); }}>Clear filters</button>}
    </div>
    <p className="text-xs text-[#66716b]" aria-live="polite">{filtered.length} matching event{filtered.length === 1 ? "" : "s"}</p>
    {view === "list" ? <section className="space-y-3">{filtered.map(({ index }) => rows[index])}</section> : <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#dfe4e1] p-4"><button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className={control}><ChevronLeft size={18}/></button><h2 className="text-base font-bold">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`))}</h2><button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className={control}><ChevronRight size={18}/></button><button type="button" onClick={() => setMonth(new Date().toISOString().slice(0, 7))} className={control}>Today</button><input aria-label="Calendar month" type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} className={control}/></div>
      <div className="hidden grid-cols-7 sm:grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="border-b border-[#dfe4e1] p-2 text-xs font-semibold text-[#66716b]">{day}</div>)}{calendarDays(month).map((date, index) => <div key={date ?? index} className="min-h-28 min-w-0 border-b border-r border-[#e7ebe8] p-2">{date && <><p className="text-xs font-semibold">{Number(date.slice(-2))}</p>{filtered.filter(({ event, start }) => inDay(start, event, date)).map(({ event }) => <Link key={event.id} href={`/events/${event.id}`} className="mt-2 block break-words rounded bg-[#eef1ef] p-2 text-xs font-semibold hover:bg-[#dfe4e1]">{event.title}<span className="mt-1 block text-[10px] font-normal capitalize">{event.status.replaceAll("_", " ")}</span></Link>)}</>}</div>)}</div>
      <div className="divide-y divide-[#e7ebe8] sm:hidden">{calendarDays(month).flatMap((date) => date ? filtered.filter(({ event, start }) => inDay(start, event, date)).map(({ event }) => <Link key={`${date}-${event.id}`} href={`/events/${event.id}`} className="block p-4"><span className="text-xs text-[#66716b]">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</span><p className="mt-1 font-semibold">{event.title}</p><p className="mt-1 text-xs text-[#66716b]">{event.location}</p></Link>) : [])}</div>
      {!filtered.some(({ event, start }) => start.slice(0, 7) <= month && (event.endsOn ?? start).slice(0, 7) >= month) && <p className="p-8 text-center text-sm text-[#66716b]">No matching events this month.</p>}
    </section>}
    {view === "list" && !filtered.length && <p className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-8 text-center text-sm text-[#66716b]">{events.length ? "No events match these filters." : "No events scheduled yet."}</p>}
  </div>;
}
