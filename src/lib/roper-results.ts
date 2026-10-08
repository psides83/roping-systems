import { compareMoneyPools, type PublicMoneyResult } from "./events/public-money-results";

export interface PersonalResult {
  id: string; number: number; competitionStatus: string; ropingId: string; ropingName: string;
  division: string | null; date: string; mainRoundCount: number; resultStatus: string;
  eventTitle: string; eventSlug: string; public: boolean; paidCents: number | string;
  runs: { round: number; status: string; time: number | string | null }[];
  awards: PublicMoneyResult[];
}
export interface PersonalResults { total: number; page: number; seasons: { id: string; name: string }[]; entries: PersonalResult[] }
export function personalResultSummary(entry: PersonalResult) {
  const qualified = entry.runs.filter((run) => run.status === "complete" && run.time !== null);
  const main = qualified.filter((run) => run.round <= entry.mainRoundCount);
  const awards = [...entry.awards].sort(compareMoneyPools);
  const winningsCents = awards.reduce((sum, a) => sum + Number(a.payoutCents), 0);
  const paidCents = Number(entry.paidCents);
  const sum = (runs: typeof qualified) => runs.length ? Math.round(runs.reduce((total, run) => total + Number(run.time), 0) * 100) / 100 : null;
  return { awards, mainAggregate: sum(main), aggregate: sum(qualified), qualifiedCount: qualified.length,
    winningsCents, paidCents, remainingCents: entry.resultStatus === "official" ? Math.max(0, winningsCents - paidCents) : 0,
    needsReconciliation: paidCents > winningsCents };
}
export function personalResultsTotals(entries: PersonalResult[]) {
  return entries.reduce((totals, entry) => {
    const result = personalResultSummary(entry);
    totals[entry.resultStatus === "official" ? "officialCents" : "provisionalCents"] += result.winningsCents;
    totals.paidCents += result.paidCents;
    totals.remainingCents += result.remainingCents;
    return totals;
  }, { officialCents: 0, provisionalCents: 0, paidCents: 0, remainingCents: 0 });
}
