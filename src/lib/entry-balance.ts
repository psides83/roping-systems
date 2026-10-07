export interface BalanceEntry { id: string; competitionStatus: string; paymentStatus: string }
export interface BalanceCharge { entryId: string | null; amountCents: number; waived: boolean }
export interface BalancePayment { amountCents: number; voided: boolean }

export function calculateEntryBalance(entries: BalanceEntry[], charges: BalanceCharge[], payments: BalancePayment[]) {
  const payable = entries.filter((entry) => entry.competitionStatus === "active" && !["comped", "refunded"].includes(entry.paymentStatus));
  const ids = new Set(payable.map((entry) => entry.id));
  const billable = (charge: BalanceCharge) => !charge.waived && (charge.entryId ? ids.has(charge.entryId) : ids.size > 0);
  const amountDueCents = charges.reduce((sum, charge) => sum + (billable(charge) ? charge.amountCents : 0), 0);
  const recordedPaymentCents = payments.reduce((sum, payment) => sum + (payment.voided ? 0 : payment.amountCents), 0);
  const markedPaid = !payments.some((payment) => !payment.voided) && payable.length > 0 && payable.every((entry) => entry.paymentStatus === "paid_cash");
  const amountPaidCents = markedPaid ? amountDueCents : recordedPaymentCents;
  return { amountDueCents, amountPaidCents, recordedPaymentCents, markedPaid,
    balanceDueCents: Math.max(amountDueCents - amountPaidCents, 0),
    creditCents: Math.max(amountPaidCents - amountDueCents, 0), billable };
}
