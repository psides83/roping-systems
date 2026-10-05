"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown, Radio, Search } from "lucide-react";
import type { PublicEvent } from "@/lib/events/public-event-data";
import { publicEventDate, publicEventHref } from "@/lib/events/public-event-navigation";
import { browseResultEvents, eventSeason, type ProducerSeason } from "@/lib/seasons";

export function PublicEventBrowser({ events, selectedSlug, producerSlug, seasons, timezone }: {
  events: PublicEvent[]; selectedSlug?: string; producerSlug: string; seasons: ProducerSeason[]; timezone: string;
}) {
  const [season, setSeason] = useState("all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const orderedSeasons = seasons.toSorted((a, b) => b.startsOn.localeCompare(a.startsOn));
  const unassigned = events.some((event) => event.status === "completed" && !eventSeason(event.startsAt, seasons, timezone));
  const { live, past } = browseResultEvents(events, search, season, seasons, timezone, oldestFirst);

  return (
    <aside aria-label="Browse event results" className="min-w-0 lg:sticky lg:top-6">
      <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)} className="mt-2 flex min-h-10 w-full items-center justify-between text-sm font-semibold lg:hidden">
        Browse results <ChevronDown size={15} className={expanded ? "rotate-180" : ""} />
      </button>
      <div id={listId} className={`${expanded ? "block" : "hidden"} lg:block`}>
      <div className="relative mt-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#758078]" />
        <input type="search" aria-label="Find an event" placeholder="Find an event" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false); }} className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white pl-9 pr-3 text-sm" />
      </div>
      {[{ title: "Live results", items: live }, { title: "Past results", items: showAll ? past : past.slice(0, 5) }].map((section) => (
      <section key={section.title} aria-label={section.title} className="mt-4 border-t border-[#d7ddda] pt-4">
        <h3 className="text-sm font-bold">{section.title}</h3>
        {section.title === "Past results" ? <div className="mt-3 flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-[#66716b]">Season
            <select value={season} onChange={(event) => { setSeason(event.target.value); setShowAll(false); }} className="mt-1 block h-9 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-3 text-xs">
              <option value="all">All seasons</option>
              {orderedSeasons.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
              {unassigned ? <option value="unassigned">Outside seasons</option> : null}
            </select>
          </label>
          <label className="text-xs font-semibold text-[#66716b]">Sort
            <select value={oldestFirst ? "oldest" : "newest"} onChange={(event) => { setOldestFirst(event.target.value === "oldest"); setShowAll(false); }} className="mt-1 block h-9 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-3 text-xs">
              <option value="newest">Latest first</option><option value="oldest">Oldest first</option>
            </select>
          </label>
        </div> : null}
      <ul className="mt-3 divide-y divide-[#dfe4e1]">
        {section.items.map((event) => (
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
      {!section.items.length ? <p className="py-3 text-xs text-[#758078]">{search ? "No matching events." : section.title === "Past results" ? "No past results match these filters." : "No events are live right now."}</p> : null}
      {section.title === "Past results" && past.length > 5 ? <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 flex min-h-10 items-center gap-2 text-xs font-semibold"><ChevronDown size={14} className={showAll ? "rotate-180" : ""} />{showAll ? "Show fewer" : `Show all ${past.length} events`}</button> : null}
      </section>
      ))}
      </div>
    </aside>
  );
}
