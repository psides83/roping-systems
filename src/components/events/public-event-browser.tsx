"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, Radio, Search } from "lucide-react";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { publicEventDate, publicEventHref } from "@/lib/events/public-event-navigation";

export function PublicEventBrowser({ events, selectedSlug, producerSlug }: {
  events: PublicEvent[]; selectedSlug?: string; producerSlug: string;
}) {
  const selected = events.find((event) => event.slug === selectedSlug);
  const [mode, setMode] = useState(selected?.status === "completed" ? "past" : "live");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const filtered = events.filter((event) => (
    mode === "past" ? event.status === "completed" : event.status !== "completed" && event.status !== "cancelled"
  ) && `${event.title} ${event.venue} ${event.address} ${publicEventDate(event.startsAt)}`.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <aside aria-label="Browse event results" className="min-w-0 lg:sticky lg:top-6">
      <div className="grid grid-cols-2 border-b border-[#d7ddda]">
        {[{ value: "live", label: "Live & upcoming" }, { value: "past", label: "Past results" }].map((tab) => (
          <button key={tab.value} type="button" aria-pressed={mode === tab.value} onClick={() => { setMode(tab.value); setShowAll(false); setExpanded(true); }}
            className={`min-h-11 border-b-2 px-2 text-xs font-semibold ${mode === tab.value ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[#66716b]"}`}>{tab.label}</button>
        ))}
      </div>
      <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)} className="mt-2 flex min-h-10 w-full items-center justify-between text-sm font-semibold lg:hidden">
        Browse events <ChevronDown size={15} className={expanded ? "rotate-180" : ""} />
      </button>
      <div id={listId} className={`${expanded ? "block" : "hidden"} lg:block`}>
      <div className="relative mt-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#758078]" />
        <input type="search" aria-label="Find an event" placeholder="Find an event" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false); }} className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white pl-9 pr-3 text-sm" />
      </div>
      <ul className="mt-3 divide-y divide-[#dfe4e1]">
        {(showAll ? filtered : filtered.slice(0, 5)).map((event) => (
          <li key={event.id}>
            <Link href={publicEventHref(producerSlug, event.slug)} aria-current={selectedSlug === event.slug ? "page" : undefined}
              className={`block border-l-2 px-3 py-3 ${selectedSlug === event.slug ? "border-[var(--brand-accent)] bg-white" : "border-transparent hover:bg-white"}`}>
              <span className="flex items-center justify-between gap-2 text-[11px] text-[#66716b]">
                {publicEventDate(event.startsAt)}
                {event.status === "in_progress" ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><Radio size={12} /> Live</span> : null}
              </span>
              <span className="mt-1 block break-words text-sm font-semibold">{event.title}</span>
              <span className="mt-1 block text-xs text-[#758078]">{event.venue}{event.status === "completed" ? ` · ${event.resultStatus === "official" ? "Official" : "Unofficial"}` : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!filtered.length ? <p className="py-5 text-sm text-[#758078]">{search ? "No matching events." : mode === "past" ? "No completed events have been published yet." : "No live or upcoming events."}</p> : null}
      {filtered.length > 5 ? <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 flex min-h-10 items-center gap-2 text-xs font-semibold"><ChevronDown size={14} className={showAll ? "rotate-180" : ""} />{showAll ? "Show fewer" : `Show all ${filtered.length} events`}</button> : null}
      </div>
    </aside>
  );
}
