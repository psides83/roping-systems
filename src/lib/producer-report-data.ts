import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadSeasonStandings, type SeasonStandingsSource } from "@/lib/events/season-standings-data";
import { calculateSeasonStandings } from "@/lib/season-standings";
import { reportInPeriod, reportTypes, searchReport, type ReportFilters, type ProducerReport } from "@/lib/producer-reports";
import { loadReportOptions, validateReportSelection } from "@/lib/producer-report-options";
import { loadFinancialReport } from "@/lib/producer-financial-reports";

export async function loadProducerReport(filters: ReportFilters) {
  const options = await loadReportOptions();
  if (!options) throw new Error("Sign in with access to a producer.");
  validateReportSelection(options, filters);
  let report: ProducerReport;
  if (filters.report === "standings" || filters.report === "attendance") {
    const season = options.seasons.find(row => row.id === filters.season)!;
    let source: SeasonStandingsSource;
    if (filters.report === "standings") source = await loadSeasonStandings(options.producer.slug, season.id);
    else {
      const db = await createClient();
      const result = await db.rpc("public_season_standings_source", { target_producer_slug: options.producer.slug, target_season_id: season.id });
      if (result.error) throw new Error("Unable to load attendance.");
      source = result.data as SeasonStandingsSource;
    }
    const contributions = filters.report === "attendance" ? source.contributions.filter(row => reportInPeriod(row.date, filters) && (!filters.event || row.eventId === filters.event)) : source.contributions;
    const result = calculateSeasonStandings(contributions, source.moves, { startsOn: season.starts_on, endsOn: season.ends_on }, filters.through ?? season.ends_on);
    const standings = filters.report === "standings";
    report = { title: reportTypes[filters.report], columns: ["Producer", "Season", "Classification", ...(standings ? ["Rank"] : []), "Roper", "City", "State", ...(standings ? ["Winnings"] : []), "Roping count", "Handicap classification", "Handicap seconds", "Roper ID", "Classification ID"],
      rows: result.rows.filter(row => (!filters.classification || row.classId === filters.classification) && (standings || row.ropingsEntered > 0)).map(row => {
        const person = source.ropers.find(person => person.roperId === row.roperId && person.classId === row.classId) ?? source.ropers.find(person => person.roperId === row.roperId);
        const classification = source.classes.find(item => item.id === row.classId);
        return [options.producer.name, season.name, classification ? `${classification.name} ${classification.divisionName}` : "Classification unavailable", ...(standings ? [row.rank] : []), person?.name ?? "Roper unavailable", person?.city ?? null, person?.state ?? null, ...(standings ? [row.winningsCents / 100] : []), row.ropingsEntered, person?.handicap ?? null, person?.handicapSeconds ?? null, row.roperId, row.classId];
      }) };
  } else report = await loadFinancialReport(options, filters);
  return { report: searchReport(report, filters.search), options };
}
