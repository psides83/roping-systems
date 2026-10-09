export interface ReconciliationFee {
  title: string; assessed_cents: number | string; collected_cents: number | string;
  waived_cents: number | string; outstanding_cents: number | string;
  roping_name?: string | null;
}
export interface ReconciliationPayment {
  amount_cents: number; voided_at: string | null;
}
export interface ReconciliationReceipt {
  amount_cents: number; reversed_at: string | null; receipt_confirmed: boolean;
}
export interface ReconciliationAward {
  event_roping_id: string; payout_cents: number | string; paid_cents: number | string;
}
export function reconciliationTotals(
  fees: ReconciliationFee[], payments: ReconciliationPayment[],
  receipts: ReconciliationReceipt[], awards: ReconciliationAward[], finalized: Set<string>,
) {
  const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
  const activeReceipts = receipts.filter((receipt) => !receipt.reversed_at);
  const collected = sum(fees, (fee) => Number(fee.collected_cents));
  const recorded = sum(payments.filter((payment) => !payment.voided_at), (payment) => payment.amount_cents);
  const awarded = sum(awards, (award) => Number(award.payout_cents));
  const paid = sum(activeReceipts, (receipt) => receipt.amount_cents);
  return {
    assessed: sum(fees, (fee) => Number(fee.assessed_cents)), collected, recorded,
    collectionDifference: collected - recorded,
    waived: sum(fees, (fee) => Number(fee.waived_cents)),
    outstanding: sum(fees, (fee) => Number(fee.outstanding_cents)),
    awarded, finalizedAwards: sum(awards.filter((award) => finalized.has(award.event_roping_id)), (award) => Number(award.payout_cents)),
    remainingAwards: sum(awards, (award) => Math.max(0, Number(award.payout_cents) - Number(award.paid_cents))),
    paid, payoutDifference: sum(awards, (award) => Number(award.paid_cents)) - paid,
    unconfirmed: sum(activeReceipts.filter((receipt) => !receipt.receipt_confirmed), (receipt) => receipt.amount_cents),
    changedAwards: awards.filter((award) => Number(award.paid_cents) > Number(award.payout_cents)).length,
  };
}
