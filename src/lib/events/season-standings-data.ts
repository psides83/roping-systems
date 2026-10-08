import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { StandingContribution, StandingMove } from "@/lib/season-standings";

export interface SeasonStandingsSource {
  contributions: (StandingContribution & { entryIds: string[]; eventId: string | null; source?: "migration" })[];
  moves: StandingMove[];
  classes: { id: string; name: string; divisionName: string }[];
  ropers: { roperId: string; classId: string; name: string; city: string | null; state: string | null;
    handicap: string | null; handicapSeconds: number | null }[];
}

export async function loadSeasonStandings(producerSlug: string, seasonId: string, cachePublicReads = false) {
  const { url, key } = cachePublicReads ? getSupabaseConfig() : { url: "", key: "" };
  // Only anonymous public RPCs use this short cache; live results and staff reads stay uncached.
  const db = cachePublicReads ? createPublicClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "force-cache", next: { revalidate: 30 } }) },
  }) : await createClient();
  const result = await db.rpc("public_season_standings_source", {
    target_producer_slug: producerSlug, target_season_id: seasonId,
  });
  if (result.error) throw new Error(`Unable to load standings: ${result.error.message}`);
  const source = result.data as SeasonStandingsSource;
  const winnings = new Map<string, number>();
  for (const eventId of new Set(source.contributions.map((item) => item.eventId).filter((id): id is string => Boolean(id)))) {
    for (let first = 0; ; first += 500) {
      const awards = await db.rpc("public_event_money_results", { target_event_id: eventId })
        .order("plan_id").order("section_type").order("round_number", { nullsFirst: true })
        .order("d_number", { nullsFirst: true }).order("entry_id").range(first, first + 499);
      if (awards.error) throw new Error(`Unable to load standings winnings: ${awards.error.message}`);
      for (const award of awards.data ?? []) winnings.set(award.entry_id,
        (winnings.get(award.entry_id) ?? 0) + Number(award.payout_cents));
      if ((awards.data?.length ?? 0) < 500) break;
    }
  }
  source.contributions = source.contributions.map((item) => ({ ...item,
    winningsCents: item.source === "migration" ? item.winningsCents : item.entryIds.reduce((sum, id) => sum + (winnings.get(id) ?? 0), 0),
  }));
  return source;
}
