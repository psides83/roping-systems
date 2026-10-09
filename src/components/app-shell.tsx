"use client";

import { NavigationGuardLink as Link } from "nextjs-nav-guard";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Gauge,
  Menu,
  PiggyBank,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/auth/actions";
import { switchProducer } from "@/app/actions/producers";
import { getBrandStyle } from "@/lib/branding";
import { NavigationPending } from "@/components/ui/navigation-pending";
import { NotificationBell } from "@/components/notifications/notification-bell";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Gauge },
  { name: "Members", href: "/members", icon: Users },
  { name: "Ropings", href: "/events", icon: CalendarDays },
  { name: "Live event", href: "/events/current", icon: CircleDollarSign },
  { name: "Added-money funds", href: "/funds", icon: PiggyBank },
  {
    name: "Roping setup",
    href: "/settings/classifications",
    icon: SlidersHorizontal,
  },
];

export function AppShell({
  children,
  producerName = "Red River Calf Ropers",
  producers = [],
  activeProducerId,
  userLabel = "Payton B.",
  brandPrimary,
  brandAccent,
  demo = false,
  platformOwner = false,
}: {
  children: React.ReactNode;
  producerName?: string;
  producers?: Array<{ id: string; name: string }>;
  activeProducerId?: string;
  userLabel?: string;
  brandPrimary?: string;
  brandAccent?: string;
  demo?: boolean;
  platformOwner?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [producerMenuOpen, setProducerMenuOpen] = useState(false);
  const currentNavigationHref = navigation
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((first, second) => second.href.length - first.href.length)[0]?.href;

  return (
    <div
      style={getBrandStyle(brandPrimary, brandAccent)}
      className="min-h-screen bg-[#f5f6f7] lg:grid lg:grid-cols-[244px_1fr]"
    >
      {open ? (
        <button
          aria-label="Close navigation"
          className="navigation-backdrop fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[244px] flex-col brand-primary-fill text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <span className="grid h-9 w-9 place-items-center rounded-md brand-accent-fill text-sm font-black">
              RS
            </span>
            <span>
              <span className="block text-sm font-bold">Roping Systems</span>
              <span className="block text-[11px] brand-muted">
                Event operations
              </span>
            </span>
          </Link>
          <button
            className="grid h-9 w-9 place-items-center lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>
        <div className="relative mx-3 mt-4 rounded-md border border-white/10 bg-white/[0.06] p-3">
          <p className="text-[10px] font-bold uppercase brand-muted">
            Producer
          </p>
          <button
            onClick={() => setProducerMenuOpen((value) => !value)}
            className="mt-1 flex w-full items-center justify-between text-left text-sm font-semibold"
          >
            {producerName}{" "}
            <ChevronDown
              size={15}
              className={cn(
                "brand-muted transition",
                producerMenuOpen && "rotate-180",
              )}
            />
          </button>
          {producerMenuOpen ? (
            <div className="menu-enter absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-md border border-[#dfe4e1] bg-white py-1 text-[#17201c] shadow-xl">
              {demo ? (
                <p className="px-3 py-2 text-xs text-[#66716b]">
                  Producer switching becomes available after Supabase is
                  connected.
                </p>
              ) : (
                producers.map((producer) => (
                  <form action={switchProducer} key={producer.id}>
                    <input
                      type="hidden"
                      name="producerId"
                      value={producer.id}
                    />
                    <input type="hidden" name="returnTo" value={pathname} />
                    <button
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold hover:bg-[#f2f4f3]",
                        producer.id === activeProducerId &&
                          "text-[var(--brand-accent-strong)]",
                      )}
                    >
                      {producer.name}
                      {producer.id === activeProducerId ? (
                        <span>Active</span>
                      ) : null}
                    </button>
                  </form>
                ))
              )}
              {platformOwner ? <Link
                href="/onboarding?new=1"
                className="block border-t border-[#e7ebe8] px-3 py-2 text-xs font-semibold text-[var(--brand-accent-strong)]"
              >
                Create another producer
              </Link> : null}
            </div>
          ) : null}
        </div>
        <nav className="mt-5 flex-1 space-y-1 px-3">
          {navigation.map((item) => {
            const active =
              item.name === "Roping setup"
                ? [
                    "/settings/classifications",
                    "/settings/roping-templates",
                    "/settings/payouts",
                    "/settings/timing",
                  ].some((href) => pathname === href)
                : item.href === currentNavigationHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  active
                    ? "bg-white text-[#17201c]"
                    : "brand-muted brand-hover hover:bg-white/[0.07]",
                )}
              >
                <Icon size={18} strokeWidth={1.8} />
                {item.name}
                <NavigationPending className="ml-auto" />
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            href="/settings"
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm brand-muted hover:bg-white/[0.07] brand-hover"
          >
            <Settings size={18} /> Settings
            <NavigationPending className="ml-auto" />
          </Link>
          <div className="mt-2 flex items-center gap-3 px-3 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e0a458] text-xs font-bold text-[#38220c]">
              {userLabel.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{userLabel}</p>
              <p className="text-xs brand-muted">
                {demo ? "Preview mode" : "Producer account"}
              </p>
            </div>
          </div>
          {!demo ? (
            <form action={signOut}>
              <button className="mt-1 h-9 w-full rounded-md px-3 text-left text-xs font-semibold brand-muted hover:bg-white/[0.07] brand-hover">
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#dfe4e1] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="grid h-9 w-9 place-items-center rounded-md border border-[#dfe4e1] lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div>
              <p className="text-sm font-semibold text-[#17201c]">
                {producerName}
              </p>
              <p className="hidden text-xs text-[#758078] sm:block">
                {demo ? "Preview data" : "2026 season"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!demo && <NotificationBell key={activeProducerId} scope="staff" producerId={activeProducerId} />}
            <Link
              href="/events/current"
              className="hidden h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white hover:bg-[var(--brand-accent-strong)] sm:flex"
            >
              <span className="h-2 w-2 rounded-full bg-white" /> Live event
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
