export interface FeeCollection {
  fee_id: string;
  title: string;
  event_roping_id: string | null;
  roping_name: string | null;
  kind: string;
  contributes_to_payout: boolean;
  assessed_cents: number | string;
  waived_cents: number | string;
  collected_cents: number | string;
  outstanding_cents: number | string;
  charge_count: number | string;
  partial_payments: boolean;
}

export function feeCollectionTotals(fees: FeeCollection[]) {
  return fees.reduce((total, fee) => ({
    collectedCents: total.collectedCents + Number(fee.collected_cents),
    outstandingCents: total.outstandingCents + Number(fee.outstanding_cents),
  }), { collectedCents: 0, outstandingCents: 0 });
}

export function feeCollectionCategory(fee: Pick<FeeCollection, "kind" | "contributes_to_payout">) {
  if (fee.kind === "added_money") return "fundContributions";
  if (fee.contributes_to_payout || fee.kind === "side_pot" || fee.kind === "insurance") return "payoutFees";
  return "nonPayoutFees";
}

export function feeCollectionAllocations(fees: FeeCollection[]) {
  return fees.reduce((totals, fee) => {
    const amount = Number(fee.collected_cents);
    totals[feeCollectionCategory(fee)] += amount;
    return totals;
  }, { nonPayoutFees: 0, payoutFees: 0, fundContributions: 0 });
}

export function payoutSummary(totalCents: number, completedCents: number) {
  return { dueCents: totalCents, completedCents, remainingCents: Math.max(totalCents - completedCents, 0) };
}
