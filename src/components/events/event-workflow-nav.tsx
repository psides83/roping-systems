"use client";

import { useEffect, useRef } from "react";
import { HelpLink } from "@/components/help/help-link";
import Link from "next/link";
import { ArrowLeft, Banknote, ClipboardList, LayoutDashboard, PanelsTopLeft, Printer, Radio } from "lucide-react";
import { NavigationPending } from "@/components/ui/navigation-pending";

export function EventWorkflowNav({ eventId, active, documentRopingId, documentRound }: { eventId: string; active: "event" | "entries" | "live" | "payouts" | "documents" | "arenas"; documentRopingId?: string; documentRound?: number }) {
  const links = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = links.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !selected) return;
    const revealActive = () => {
      list.scrollLeft += selected.getBoundingClientRect().left - list.getBoundingClientRect().left - 12;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active]);
  const helpGuide = active === "entries" ? "entries" : active === "payouts" ? "payouts" : active === "live" || active === "arenas" ? "live-desk" : active === "documents" ? "print-documents" : "schedule-event";
  const documentQuery = new URLSearchParams();
  if (active === "live") { documentQuery.set("type", "timer"); if (documentRopingId) documentQuery.set("roping", documentRopingId); if (documentRound) documentQuery.set("round", String(documentRound)); }
  if (active === "entries") documentQuery.set("type", "entries");
  if (active === "payouts") documentQuery.set("type", "payouts");
  const steps = [
    { id: "event", label: "Event", path: "", icon: LayoutDashboard },
    { id: "entries", label: "Entries", path: "/entries", icon: ClipboardList },
    { id: "arenas", label: "Arena overview", path: "/arenas", icon: PanelsTopLeft },
    { id: "live", label: "Live desk", path: "/live", icon: Radio },
    { id: "payouts", label: "Payouts", path: "/payouts", icon: Banknote },
    { id: "documents", label: "Print documents", path: `/documents${documentQuery.size ? `?${documentQuery}` : ""}`, icon: Printer },
  ];
  return <nav aria-label="Event workflow" className={`items-center border-b border-[#dfe4e1] text-sm font-semibold ${active === "live" ? "grid grid-cols-[minmax(0,1fr)_auto] gap-2 pb-2 sm:flex sm:flex-wrap sm:gap-x-4 sm:pb-3" : "flex flex-wrap gap-x-4 gap-y-2 pb-3"}`}>
    <Link href="/events" className={`${active === "live" ? "hidden sm:inline-flex" : "inline-flex"} min-h-10 items-center gap-2 text-[#66716b]`}><ArrowLeft size={16} />Events</Link>
    <div ref={links} className="flex min-w-0 max-w-full gap-1 overflow-x-auto">{steps.map(({ id, label, path, icon: Icon }) => <Link key={id} href={`/events/${eventId}${path}`} aria-current={active === id ? "page" : undefined}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 ${active === id ? "bg-[#eef1ef] text-[#17201c]" : "text-[#66716b] hover:bg-[#f5f7f6]"}`}><Icon size={16} /><span>{label}</span><NavigationPending label={`Loading ${label.toLowerCase()}`} /></Link>)}</div>
    <HelpLink guide={helpGuide} label="Help with this screen" compact={active === "live"} />
  </nav>;
}
