"use client";

import { NavigationGuardLink as Link } from "nextjs-nav-guard";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import type { NotificationScope } from "@/lib/notifications";

export function NotificationBell({ scope, producerId }: { scope: NotificationScope; producerId?: string }) {
  const [status, setStatus] = useState<{ count: number | null; failed: boolean }>({ count: null, failed: false });
  const query = new URLSearchParams({ scope, ...(producerId ? { producer: producerId } : {}) }).toString();
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    async function refresh() {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetch(`/api/notifications?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json();
        if (typeof result.unread !== "number") throw new Error("Invalid count");
        if (active) setStatus({ count: result.unread, failed: false });
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setStatus(previous => ({ ...previous, failed: true }));
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 60000);
    for (const event of ["focus", "online", "notifications-changed"]) window.addEventListener(event, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); for (const event of ["focus", "online", "notifications-changed"]) window.removeEventListener(event, refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [query]);
  const label = status.failed ? "Notifications - unable to refresh count" : status.count === null ? "Notifications - loading count" : `Notifications - ${status.count} unread`;
  return <Link href={`/notifications?${query}`} aria-label={label} title={label} className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#dfe4e1] bg-white text-[#17201c] hover:bg-[#f2f4f3]">
    <Bell size={19} />{status.failed ? <span className="absolute -right-1 -top-1 rounded bg-amber-100 px-1 text-xs font-bold text-amber-900">!</span> : status.count ? <span className="absolute -right-1 -top-1 min-w-4 rounded bg-[var(--brand-accent,#bb3e24)] px-1 text-center text-[10px] font-bold leading-4 text-white">{status.count > 99 ? "99+" : status.count}</span> : null}
  </Link>;
}
