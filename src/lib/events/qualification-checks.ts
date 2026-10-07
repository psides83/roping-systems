import "server-only";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { calculateSeasonStandings } from "@/lib/season-standings";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { includeFinalsPositions } from "@/lib/finals-entry-eligibility";

export async function buildQualificationCheck(ropingId: string, seasonId: string, classKey: string, bonusEntries?: boolean) {
  const producer = await getActiveProducer();
  if (!producer || (producer.role === "viewer" && !producer.eventManager)) throw new Error("Manager access is required.");
  const db = await createClient();
  const scope = await db.rpc("can_manage_event_roping", { target_roping: ropingId });
  if (scope.error || !scope.data) throw new Error("Management access for this roping is required.");
  const settings = await db.from("producers").select("standings_revision").eq("id", producer.id).single();
  const season = await db.from("producer_seasons").select("starts_on,ends_on").eq("id", seasonId).eq("producer_id", producer.id).single();
  const rule = await db.from("standings_qualification_rules").select("cutoff_on,updated_at")
    .eq("producer_id", producer.id).eq("season_id", seasonId).eq("class_key", classKey).single();
  if (settings.error || season.error || rule.error) throw new Error("Configure qualification requirements for this class and season first.");
  const source = await loadSeasonStandings(producer.slug, seasonId);
  const standings = calculateSeasonStandings(source.contributions, source.moves,
    { startsOn: season.data.starts_on, endsOn: season.data.ends_on }, rule.data.cutoff_on ?? season.data.ends_on).rows
    .filter((row) => row.classId === classKey);
  const finals = await loadFinalsQualifications(producer.slug, seasonId, rule.data.cutoff_on ?? season.data.ends_on);
  const rows = includeFinalsPositions(standings, finals.totals, finals.profiles, classKey);
  const current = await db.from("roping_qualification_checks").select("bonus_entries_enabled").eq("event_roping_id", ropingId).eq("producer_id", producer.id).maybeSingle();
  if (current.error) throw new Error("Unable to load bonus entry rules.");
  const result = await db.rpc("save_roping_qualification_check_with_bonus", {
    target_roping_id: ropingId, target_season_id: seasonId, target_class_key: classKey,
    expected_revision: settings.data.standings_revision, target_standings: rows,
    target_rule_updated_at: rule.data.updated_at,
    target_bonus_entries_enabled: bonusEntries ?? current.data?.bonus_entries_enabled ?? false,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function refreshEventQualificationChecks(eventId: string, ropingId?: string): Promise<string | null> {
  try {
    const producer = await getActiveProducer();
    if (!producer || (producer.role === "viewer" && !producer.entryOffice && !producer.eventManager)) return "Manager access is required.";
    const db = await createClient();
    let query = db.from("roping_qualification_checks")
      .select("event_roping_id,season_id,class_key,source_revision,rule_updated_at,event_ropings!inner(event_id,classification_id,division_id,competition_format)")
      .eq("producer_id", producer.id).eq("event_ropings.event_id", eventId);
    if (ropingId) query = query.eq("event_roping_id", ropingId);
    const checks = await query;
    if (checks.error) return checks.error.message;
    if (!checks.data.length) return null;
    for (const check of checks.data) {
      const roping = check.event_ropings as unknown as { classification_id: string | null; division_id: string; competition_format: string };
      const classKey = ["handicap", "four_d"].includes(roping.competition_format)
        ? `${roping.division_id}:${roping.competition_format}` : roping.classification_id;
      if (classKey !== check.class_key) return "This roping classification changed. Update its qualification setup before accepting entries.";
      const revision = await db.from("producers").select("standings_revision").eq("id", producer.id).single();
      const rule = await db.from("standings_qualification_rules").select("updated_at")
        .eq("season_id", check.season_id).eq("class_key", check.class_key).eq("producer_id", producer.id).maybeSingle();
      if (revision.error || rule.error) return "Unable to refresh qualification standings.";
      if (!rule.data) return "This roping's qualification requirements were removed. Update its qualification setup.";
      if (String(check.source_revision) !== String(revision.data.standings_revision) || check.rule_updated_at !== rule.data.updated_at) {
        if (producer.entryOffice) return "A manager must refresh this roping's qualification standings before entries can be accepted.";
        await buildQualificationCheck(check.event_roping_id, check.season_id, check.class_key);
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Unable to refresh qualification standings.";
  }
}
