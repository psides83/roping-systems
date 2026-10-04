export interface PublicMoneyResult {
  ropingId: string;
  planId: string;
  poolName: string;
  poolType: string;
  sectionType: string;
  roundNumber: number | null;
  dNumber: number | null;
  place: number;
  entryId: string;
  roperId: string;
  name: string;
  time: number;
  payoutCents: number;
}

export function moneyWinnerRanking(awards: PublicMoneyResult[]) {
  const winners = new Map<string, { roperId: string; name: string; mainCents: number; sideCents: number; totalCents: number; place: number }>();
  for (const award of awards) {
    if (award.payoutCents <= 0) continue;
    const winner = winners.get(award.roperId) ?? {
      roperId: award.roperId, name: award.name, mainCents: 0, sideCents: 0, totalCents: 0, place: 0,
    };
    if (award.poolType === "main") winner.mainCents += award.payoutCents;
    else winner.sideCents += award.payoutCents;
    winner.totalCents += award.payoutCents;
    winners.set(award.roperId, winner);
  }
  const ranked = [...winners.values()].sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
  return ranked.map((winner, index) => ({
    ...winner,
    place: index > 0 && ranked[index - 1].totalCents === winner.totalCents
      ? ranked.findIndex((row) => row.totalCents === winner.totalCents) + 1 : index + 1,
  }));
}

export function moneySectionLabel(award: PublicMoneyResult) {
  if (award.dNumber) return `${award.dNumber}D`;
  if (award.sectionType === "aggregate") return "Average";
  if (award.sectionType === "short_round") return "Short round";
  return `Round ${award.roundNumber}`;
}
