import "server-only";
import { createClient } from "@/lib/supabase/server";
import { effectiveQualificationRuleSet, type QualificationOverride, type QualificationRuleSet } from "@/lib/qualification-rule-sets";
import { calculateQualificationStandings } from "@/lib/season-standings";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { loadAssignedFinalsTotals } from "@/lib/events/finals-assignment-data";
import { includeFinalsPositions } from "@/lib/finals-entry-eligibility";

export async function loadEffectiveRuleSet(ropingId: string, producerId: string) {
  const db = await createClient();
  const roping = await db.from("event_ropings").select("event_id,qualification_override,qualification_rule_set_id")
    .eq("id", ropingId).eq("producer_id", producerId).single();
  if (roping.error) throw new Error("Unable to load qualification assignment.");
  const event = await db.from("events").select("qualification_rule_set_id").eq("id", roping.data.event_id).eq("producer_id", producerId).single();
  if (event.error) throw new Error("Unable to load event qualification.");
  const id = effectiveQualificationRuleSet(event.data.qualification_rule_set_id, roping.data.qualification_override as QualificationOverride, roping.data.qualification_rule_set_id);
  if (!id) return null;
  const result = await db.from("qualification_rule_sets").select("*").eq("id", id).eq("producer_id", producerId).single();
  if (result.error) throw new Error("Unable to load qualification rule set.");
  return result.data as QualificationRuleSet;
}

export async function buildRuleSetQualificationCheck(ropingId: string, classKey: string, producer: { id: string; slug: string }, rule: QualificationRuleSet) {
  const db = await createClient();
  const settings = await db.from("producers").select("standings_revision").eq("id", producer.id).single();
  const season = await db.from("producer_seasons").select("starts_on,ends_on").eq("id", rule.season_id).eq("producer_id", producer.id).single();
  if (settings.error || season.error) throw new Error("Unable to load qualification season.");
  const cutoff = rule.cutoff_on ?? season.data.ends_on;
  const source = await loadSeasonStandings(producer.slug, rule.season_id);
  const standings = calculateQualificationStandings(source.contributions, source.moves, { startsOn: season.data.starts_on, endsOn: season.data.ends_on }, cutoff, rule.attendance_cutoff_on ?? season.data.ends_on).rows.filter((row) => row.classId === classKey);
  const finals = await loadFinalsQualifications(producer.slug, rule.season_id, cutoff);
  const assigned = await loadAssignedFinalsTotals(producer.id, rule.season_id, ropingId, finals.awards);
  const rows = includeFinalsPositions(standings, assigned, finals.profiles, classKey);
  const result = await db.rpc("save_rule_set_qualification_check", {
    target_roping_id: ropingId, target_rule_set_id: rule.id, expected_revision: settings.data.standings_revision,
    expected_rule_updated_at: rule.updated_at, target_standings: rows,
  });
  if (result.error) throw new Error(result.error.message);
}
