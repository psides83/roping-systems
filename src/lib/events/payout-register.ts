export interface RegisterAward {
  planId: string;
  ropingId: string;
  ropingName: string;
  poolName: string;
  poolType: string;
  entryId: string;
  roperId: string;
  name: string;
  memberNumber: string | null;
  sectionType: string;
  round: number | null;
  dNumber: number | null;
  place: number;
  awardKey: string;
  amountCents: number;
  paidCents: number;
}

export interface PayoutReceipt {
  id: string;
  roperId: string;
  amountCents: number;
  method: string;
  recipient: string;
  confirmed: boolean;
  confirmedAt: string | null;
  note: string;
  paidAt: string;
  staff: string;
  reversedAt: string | null;
  reversalReason: string | null;
  allocations: { ropingId: string; amountCents: number }[];
}

export function registerRopers(awards: RegisterAward[]) {
  const ropers = new Map<string, {
    id: string; name: string; memberNumber: string | null; awards: RegisterAward[];
    totalCents: number; paidCents: number; dueCents: number; needsReview: boolean;
  }>();
  for (const award of awards) {
    const roper = ropers.get(award.roperId) ?? {
      id: award.roperId, name: award.name, memberNumber: award.memberNumber,
      awards: [], totalCents: 0, paidCents: 0, dueCents: 0, needsReview: false,
    };
    roper.awards.push(award);
    roper.totalCents += award.amountCents;
    roper.paidCents += award.paidCents;
    roper.dueCents += Math.max(0, award.amountCents - award.paidCents);
    roper.needsReview ||= award.paidCents > award.amountCents;
    ropers.set(award.roperId, roper);
  }
  return [...ropers.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function payoutStatus(roper: { dueCents: number; paidCents: number; needsReview: boolean }) {
  if (roper.needsReview) return "Needs review";
  if (!roper.dueCents) return "Paid";
  return roper.paidCents ? "Partially paid" : "Unpaid";
}

export function payoutStage(award: RegisterAward) {
  if (award.dNumber) return `${award.dNumber}D`;
  if (award.sectionType === "aggregate") return "Average";
  if (award.sectionType === "short_round") return "Short round";
  return `Round ${award.round}`;
}
