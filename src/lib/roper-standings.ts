import { calculateSeasonStandings, qualifiesForStandings, type StandingContribution, type StandingMove } from "./season-standings";

export interface RoperStandingsContext {
  roperId: string; producerSlug: string;
  season: { id: string; name: string; startsOn: string; endsOn: string } | null;
  seasons: { id: string; name: string }[]; currentClasses: string[];
  requirements: { classId: string; topPlaces: number | null; minimumRopings: number; cutoffOn: string | null }[];
}
export interface PortalStanding {
  classId: string; name: string; winningsCents: number; ropingsEntered: number; rank: number | null;
  handicap: string | null; handicapSeconds: number | null; hasCarryover: boolean;
  requirement?: RoperStandingsContext["requirements"][number];
  meetsRequirements: boolean; qualifyingCount: number; qualifyingRank: number | null; remainingRopings: number;
}
interface Source {
  contributions: StandingContribution[]; moves: StandingMove[];
  classes: { id: string; name: string; divisionName: string }[];
  ropers: { roperId: string; classId: string; handicap: string | null; handicapSeconds: number | null }[];
}

export function personalStandings(context: RoperStandingsContext, source: Source): PortalStanding[] {
  if (!context.season) return [];
  const season = context.season;
  const result = calculateSeasonStandings(source.contributions, source.moves, season);
  const own = result.rows.filter((row) => row.roperId === context.roperId);
  const classIds = new Set([...own.map((row) => row.classId), ...context.currentClasses]);
  const ownMoves = new Set(source.moves.filter((move) => move.roperId === context.roperId).map((move) => move.id));
  const cutoffRows = new Map<string, ReturnType<typeof calculateSeasonStandings>["rows"]>();
  return source.classes.filter((item) => classIds.has(item.id) && !source.classes.some((group) =>
    group.id.includes(":") && group.id !== item.id && group.name === item.name && group.divisionName === item.divisionName)).map((item) => {
    const row = own.find((row) => row.classId === item.id);
    const requirement = context.requirements.find((rule) => rule.classId === item.id);
    const cutoff = requirement?.cutoffOn ?? season.endsOn;
    if (!cutoffRows.has(cutoff)) cutoffRows.set(cutoff, calculateSeasonStandings(source.contributions, source.moves, season, cutoff).rows);
    const qualifying = cutoffRows.get(cutoff)!.find((candidate) => candidate.roperId === context.roperId && candidate.classId === item.id);
    const profile = source.ropers.find((profile) => profile.roperId === context.roperId && profile.classId === item.id);
    return { classId: item.id, name: `${item.name} ${item.divisionName}`, winningsCents: row?.winningsCents ?? 0,
      ropingsEntered: row?.ropingsEntered ?? 0, rank: row?.rank ?? null,
      handicap: item.id.endsWith(":handicap") ? profile?.handicap ?? null : null,
      handicapSeconds: item.id.endsWith(":handicap") ? profile?.handicapSeconds ?? null : null,
      hasCarryover: result.carryovers.some((record) => ownMoves.has(record.moveId) && [record.fromClassId, record.toClassId].includes(item.id)),
      requirement, meetsRequirements: Boolean(requirement && qualifying && qualifiesForStandings(qualifying, requirement)),
      qualifyingCount: qualifying?.ropingsEntered ?? 0, qualifyingRank: qualifying?.rank ?? null,
      remainingRopings: requirement ? Math.max(requirement.minimumRopings - (qualifying?.ropingsEntered ?? 0), 0) : 0 };
  });
}
