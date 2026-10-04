export interface PublicResult {
  resultId: string;
  divisionId: string;
  divisionName: string;
  resultStatus: string;
  name: string;
  entryNumber: number;
  totalTime: number | null;
  incentiveAdjustment: number;
  status: string;
  roundsCompleted: number;
  mainRoundCount: number;
  shortRoundQualifier: boolean;
  shortRoundStatus?: string | null;
}

export interface PublicRoundResult {
  id: string;
  entryId?: string;
  divisionId: string;
  name: string;
  entryNumber: number;
  round: number;
  totalTime: number | null;
  status: string;
  incentiveAdjustment: number;
}

export interface StandingRow {
  id: string;
  entryId?: string;
  name: string;
  entryNumber: number;
  time: number | null;
  status: string;
  adjustment: number;
  progress: string | null;
  place: number | null;
}

export function roundStandings(runs: PublicRoundResult[], round: number): StandingRow[] {
  const sorted = runs.filter((run) => run.round === round).sort((a, b) =>
    (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity) || a.name.localeCompare(b.name) || a.entryNumber - b.entryNumber,
  );
  return sorted.map((run) => ({
    id: run.id, entryId: run.entryId, name: run.name, entryNumber: run.entryNumber,
    time: run.totalTime, status: run.status, adjustment: run.incentiveAdjustment,
    progress: null,
    place: run.status === "complete" && run.totalTime !== null
      ? sorted.findIndex((other) => other.status === "complete" && other.totalTime === run.totalTime) + 1
      : null,
  }));
}

export function averageStandings(results: PublicResult[]): StandingRow[] {
  const hasShortRound = results.some((row) => row.shortRoundQualifier);
  const sorted = [...results].sort((a, b) =>
    Number(b.shortRoundQualifier) - Number(a.shortRoundQualifier) ||
    b.roundsCompleted - a.roundsCompleted ||
    (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity) || a.name.localeCompare(b.name),
  );
  const eligible = sorted.filter((row) => row.status === "complete" &&
    row.totalTime !== null && (!hasShortRound || (row.shortRoundQualifier && row.shortRoundStatus === "complete")));
  return sorted.map((row) => ({
    id: row.resultId, entryId: row.resultId, name: row.name, entryNumber: row.entryNumber,
    time: row.totalTime, status: row.status, adjustment: row.incentiveAdjustment,
    progress: `${row.roundsCompleted}/${row.mainRoundCount} main rounds${row.shortRoundQualifier ? " · Short round qualifier" : ""}`,
    place: eligible.some((other) => other.resultId === row.resultId)
      ? eligible.findIndex((other) => other.totalTime === row.totalTime) + 1 : null,
  }));
}
