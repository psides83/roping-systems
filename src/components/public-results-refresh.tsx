"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PublicResultsRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const refreshVisiblePage = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    // Public visitors may not receive row-level realtime notifications.
    const refreshInterval = window.setInterval(refreshVisiblePage, 5000);
    document.addEventListener("visibilitychange", refreshVisiblePage);
    const channel = supabase
      .channel("public-live-results")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "competition_runs" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "event_ropings" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshVisiblePage);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
