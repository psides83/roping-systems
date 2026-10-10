import { createClient } from "@/lib/supabase/server";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { calculateQualificationStandings } from "@/lib/season-standings";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { loadAssignedFinalsTotals } from "@/lib/events/finals-assignment-data";
import { includeFinalsPositions } from "@/lib/finals-entry-eligibility";
import { projectFinalsOutlook } from "@/lib/finals-outlook";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";
import { StaffOutlookTable } from "./staff-outlook-table";
import type { SeasonStandingsSource } from "@/lib/events/season-standings-data";

export async function StaffFinalsOutlook({ producer, ropingId, classKey, rule, normalEntries, source: existingSource }: {
  producer: { id: string; slug: string; timezone: string }; ropingId: string; classKey: string;
  rule: Pick<QualificationRuleSet, "season_id" | "top_places" | "minimum_ropings" | "cutoff_on" | "attendance_cutoff_on" | "earned_position_policy" | "bonus_entries_enabled"> & Partial<Pick<QualificationRuleSet, "requirement_match">>;
  normalEntries: number | null;
  source?: SeasonStandingsSource;
}) {
  const db = await createClient();
  const season = await db.from("producer_seasons").select("starts_on,ends_on").eq("id", rule.season_id).eq("producer_id", producer.id).single();
  if (season.error) throw new Error("Unable to load the outlook season.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const standingsCutoff = rule.cutoff_on ?? season.data.ends_on;
  const attendanceCutoff = rule.attendance_cutoff_on ?? season.data.ends_on;
  const standingsDate = standingsCutoff < today ? standingsCutoff : today;
  const attendanceDate = attendanceCutoff < today ? attendanceCutoff : today;
  const source = existingSource ?? await loadSeasonStandings(producer.slug, rule.season_id);
  const standings = calculateQualificationStandings(source.contributions, source.moves,
    { startsOn: season.data.starts_on, endsOn: season.data.ends_on }, standingsDate, attendanceDate).rows.filter(row => row.classId === classKey);
  const finals = await loadFinalsQualifications(producer.slug, rule.season_id, standingsDate);
  const assigned = await loadAssignedFinalsTotals(producer.id, rule.season_id, ropingId, finals.awards);
  const rows = includeFinalsPositions(standings, assigned, finals.profiles, classKey);
  const profiles = source.ropers.filter(person => person.classId === classKey);
  const names = new Map([...finals.profiles.map(person => [person.roperId, person.name] as const), ...profiles.map(person => [person.roperId, person.name] as const)]);
  const ids = new Set([...rows.map(row => row.roperId), ...profiles.map(person => person.roperId)]);
  const requirements = { topPlaces: rule.top_places, minimumRopings: rule.minimum_ropings, standingsCutoff, attendanceCutoff,
    earnedPositionPolicy: rule.earned_position_policy, requirementMatch: rule.requirement_match };
  const preview = [...ids].map(id => {
    const row = rows.find(row => row.roperId === id);
    return { id, name: names.get(id) ?? "Roper", progress: projectFinalsOutlook(row, requirements, today, normalEntries, rule.bonus_entries_enabled) };
  }).sort((a, b) => (a.progress.rank ?? Infinity) - (b.progress.rank ?? Infinity) || a.name.localeCompare(b.name));
  return <StaffOutlookTable rows={preview} today={today} minimumRopings={rule.minimum_ropings} topPlaces={rule.top_places} standingsCutoff={standingsCutoff} attendanceCutoff={attendanceCutoff} />;
}
