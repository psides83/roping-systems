"use client";

import { useRef } from "react";
import { CalendarPlus, ChevronDown, Download, ExternalLink } from "lucide-react";
import { calendarFile, googleCalendarUrl, type CalendarEvent } from "@/lib/events/calendar-export";

export function AddToCalendar({ event, schedulePath }: { event: Omit<CalendarEvent, "url">; schedulePath: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  function add(provider: "google" | "file") {
    const calendarEvent = { ...event, url: new URL(schedulePath, window.location.origin).href };
    if (provider === "google") window.open(googleCalendarUrl(calendarEvent), "_blank", "noopener,noreferrer");
    else {
      const url = URL.createObjectURL(new Blob([calendarFile(calendarEvent)], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80) || "event"}.ics`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (menu.current) menu.current.open = false;
  }
  return <details ref={menu} className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onKeyDown={(event) => { if (event.key === "Escape") { if (menu.current) menu.current.open = false; menu.current?.querySelector("summary")?.focus(); } }}>
    <summary className="flex h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] [&::-webkit-details-marker]:hidden"><CalendarPlus size={16}/>Add to calendar<ChevronDown size={14}/></summary>
    <div className="absolute left-0 z-20 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-md border border-[#d7ddda] bg-white p-1 shadow-lg sm:right-0 sm:left-auto">
      <button type="button" onClick={() => add("file")} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm hover:bg-[#eef1ef]"><span>Apple Calendar</span><Download size={15}/></button>
      <button type="button" onClick={() => add("google")} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm hover:bg-[#eef1ef]"><span>Google Calendar</span><ExternalLink size={15}/></button>
      <button type="button" onClick={() => add("file")} className="flex min-h-11 w-full items-center justify-between rounded px-3 text-left text-sm hover:bg-[#eef1ef]"><span>Microsoft Outlook</span><Download size={15}/></button>
    </div>
  </details>;
}
