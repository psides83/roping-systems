import { feeCollectionAllocations, type FeeCollection } from "./fee-collections";

export const expenseCategories = { arena: "Arena rental", cattle: "Cattle", labor: "Labor", awards: "Awards", other: "Other" } as const;
export interface EventExpense { id: string; event_roping_id: string | null; category: keyof typeof expenseCategories; amount_cents: number; note: string; revision: number; voided_at: string | null }
export interface ProfitabilityFunding { event_roping_id: string; source: string; amount_cents: number; received_cents: number; cancelled_at: string | null }
export interface ProfitabilityTransfer { event_roping_id: string; kind: string; amount_cents: number | string }
export interface ProfitabilityAward { event_roping_id: string; payout_cents: number | string; paid_cents: number | string }
export interface ProfitabilityRoping { id: string; name: string; event_day_status: string; payouts_finalized_at: string | null }

export function eventProfitability(fees: FeeCollection[], funding: ProfitabilityFunding[], transfers: ProfitabilityTransfer[], awards: ProfitabilityAward[], expenses: EventExpense[], ropings: ProfitabilityRoping[]) {
  const summarize = (ropingId?: string) => {
    const match = (id: string | null) => !ropingId || id === ropingId;
    const selectedFees = fees.filter(fee => match(fee.event_roping_id));
    const selectedAwards = awards.filter(award => match(award.event_roping_id));
    const selectedFunding = funding.filter(row => match(row.event_roping_id) && !row.cancelled_at && row.source !== "fund");
    const collected = selectedFees.reduce((sum, fee) => sum + Number(fee.collected_cents), 0);
    // Exclude earmarked contributions whether their deposit has posted yet or not.
    const { nonPayoutFees, payoutFees, fundContributions } = feeCollectionAllocations(selectedFees);
    const receivedAddedMoney = selectedFunding.reduce((sum, row) => sum + Number(row.received_cents), 0);
    const sponsorOutstanding = selectedFunding.filter(row => row.source === "sponsor").reduce((sum, row) => sum + Math.max(0, Number(row.amount_cents) - Number(row.received_cents)), 0);
    const fundMoneyUsed = 0 - transfers.filter(row => match(row.event_roping_id) && ["roping_allocation", "roping_return"].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const payoutTotal = selectedAwards.reduce((sum, row) => sum + Number(row.payout_cents), 0);
    const payoutsPaid = selectedAwards.reduce((sum, row) => sum + Number(row.paid_cents), 0);
    const expenseTotal = expenses.filter(row => !row.voided_at && match(row.event_roping_id)).reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const complete = ropings.filter(row => !ropingId || row.id === ropingId).every(row => row.event_day_status === "completed" && !!row.payouts_finalized_at) && ropings.length > 0;
    return { collected, nonPayoutFees, payoutFees, nonPayoutFeesAfterExpenses: nonPayoutFees - expenseTotal,
      fundContributions, receivedAddedMoney, sponsorOutstanding, fundMoneyUsed, payoutTotal, payoutsPaid, expenseTotal,
      payoutRemaining: Math.max(0, payoutTotal - payoutsPaid), outstandingFees: selectedFees.reduce((sum, fee) => sum + Number(fee.outstanding_cents), 0),
      netRetained: complete ? collected - fundContributions + receivedAddedMoney + fundMoneyUsed - payoutTotal - expenseTotal : null };
  };
  return { total: summarize(), ropings: ropings.map(roping => ({ ...roping, ...summarize(roping.id) })), sharedExpenses: expenses.filter(row => !row.event_roping_id && !row.voided_at).reduce((sum, row) => sum + Number(row.amount_cents), 0) };
}
