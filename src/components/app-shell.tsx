"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, ChevronDown, CircleDollarSign, Gauge, Menu, Settings, SlidersHorizontal, Users, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Gauge },
  { name: "Members", href: "/members", icon: Users },
  { name: "Ropings", href: "/ropings", icon: CalendarDays },
  { name: "Live event", href: "/ropings/current", icon: CircleDollarSign },
  { name: "Divisions & fees", href: "/settings/divisions", icon: SlidersHorizontal },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const currentNavigationHref = navigation
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((first, second) => second.href.length - first.href.length)[0]?.href;

  return (
    <div className="min-h-screen bg-[#f5f6f7] lg:grid lg:grid-cols-[244px_1fr]">
      {open ? <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[244px] flex-col bg-[#17251f] text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <span className="grid h-9 w-9 place-items-center rounded-md bg-[#bb3e24] text-sm font-black">RS</span>
            <span><span className="block text-sm font-bold">Roping Systems</span><span className="block text-[11px] text-white/55">Event operations</span></span>
          </Link>
          <button className="grid h-9 w-9 place-items-center lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>
        <div className="mx-3 mt-4 rounded-md border border-white/10 bg-white/[0.06] p-3">
          <p className="text-[10px] font-bold uppercase text-white/45">Organization</p>
          <button className="mt-1 flex w-full items-center justify-between text-left text-sm font-semibold">Red River Calf Ropers <ChevronDown size={15} className="text-white/50" /></button>
        </div>
        <nav className="mt-5 flex-1 space-y-1 px-3">
          {navigation.map((item) => {
            const active = item.href === currentNavigationHref;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition", active ? "bg-white text-[#17251f]" : "text-white/70 hover:bg-white/[0.07] hover:text-white")}>
                <Icon size={18} strokeWidth={1.8} />{item.name}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link href="/settings" className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-white/65 hover:bg-white/[0.07] hover:text-white"><Settings size={18} /> Settings</Link>
          <div className="mt-2 flex items-center gap-3 px-3 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e0a458] text-xs font-bold text-[#38220c]">PB</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Payton B.</p><p className="text-xs text-white/45">Organization owner</p></div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#dfe4e1] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="grid h-9 w-9 place-items-center rounded-md border border-[#dfe4e1] lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div><p className="text-sm font-semibold text-[#17201c]">Red River Calf Ropers</p><p className="hidden text-xs text-[#758078] sm:block">2026 season</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/ropings/current" className="hidden h-9 items-center gap-2 rounded-md bg-[#bb3e24] px-3 text-sm font-semibold text-white hover:bg-[#91301c] sm:flex"><span className="h-2 w-2 rounded-full bg-white" /> Live event</Link>
            <button aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-md border border-[#dfe4e1] bg-white text-[#4d5952]"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#bb3e24]" /></button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
