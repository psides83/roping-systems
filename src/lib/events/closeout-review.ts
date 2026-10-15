import type { reconciliationTotals } from "./reconciliation";

type Totals = ReturnType<typeof reconciliationTotals>;
export interface CloseoutReviewItem {
  id: string; title: string; detail: string; href: string; action: string; amountCents?: number;
}
export function closeoutReview({ eventId, totals: t, ropings, sponsorCommitted, sponsorReceived }: {
  eventId: string; totals: Totals;
  ropings: { event_day_status: string; payouts_finalized_at: string | null }[];
  sponsorCommitted: number; sponsorReceived: number;
}): CloseoutReviewItem[] {
  const base = `/events/${encodeURIComponent(eventId)}`;
  const items: CloseoutReviewItem[] = [];
  const add = (item: CloseoutReviewItem) => items.push(item);
  if (t.collectionDifference !== 0) add({ id: "collections", title: "Review entry payment difference", amountCents: Math.abs(t.collectionDifference), detail: t.collectionDifference > 0 ? "Fees marked collected exceed recorded payment receipts. Review paid flags, refunds, credits, and unallocated payments." : "Recorded payment receipts exceed fees marked collected. Review credits, refunds, and payment allocation.", href: `${base}/entries#entry-ledger`, action: "Review entry payments" });
  if (t.payoutDifference !== 0) add({ id: "payouts", title: "Review payout payment difference", amountCents: Math.abs(t.payoutDifference), detail: "Award payment markings and payout receipts differ. Review the payment history before recording more money.", href: `${base}/payouts#payout-register`, action: "Review payout records" });
  if (t.changedAwards > 0) add({ id: "changed-awards", title: `Review ${t.changedAwards} overpaid ${t.changedAwards === 1 ? "award" : "awards"}`, detail: "Recorded payments exceed current winnings. Review affected payments and any needed reversal.", href: `${base}/payouts#payout-register`, action: "Review affected awards" });
  if (t.outstanding > 0) add({ id: "entry-balances", title: "Resolve outstanding entry charges", amountCents: t.outstanding, detail: "Some assessed charges remain outstanding. Review balances and record payments or authorized adjustments.", href: `${base}/entries#entry-ledger`, action: "Review entry balances" });
  const unfinished = ropings.filter(roping => roping.event_day_status !== "completed").length;
  const unfinalized = ropings.filter(roping => !roping.payouts_finalized_at).length;
  if (unfinished) add({ id: "competition", title: `Complete ${unfinished} ${unfinished === 1 ? "roping" : "ropings"}`, detail: "Unfinished ropings do not contribute calculated winnings to this report yet.", href: `${base}/arenas`, action: "Review arena progress" });
  if (unfinalized) add({ id: "finalization", title: `Finalize payouts for ${unfinalized} ${unfinalized === 1 ? "roping" : "ropings"}`, detail: "Calculated awards may still change until payouts are finalized. Complete and review each roping first.", href: `${base}/payouts#payout-finalization`, action: "Review payout finalization" });
  if (t.remainingAwards > 0) add({ id: "award-balances", title: "Review winnings still due", amountCents: t.remainingAwards, detail: "Includes calculated awards from completed ropings. Finalize payouts before recording payments in the register.", href: `${base}/payouts#payout-register`, action: "Review payout balances" });
  if (t.unconfirmed > 0) add({ id: "acknowledgments", title: "Confirm payout receipts", amountCents: t.unconfirmed, detail: "Payments are recorded, but recipient acknowledgment is missing. Confirmation does not record another payment.", href: `${base}/payouts#payout-register`, action: "Review acknowledgments" });
  if (sponsorCommitted > sponsorReceived) add({ id: "sponsors", title: "Review outstanding sponsor pledges", amountCents: sponsorCommitted - sponsorReceived, detail: "Committed sponsor money has not all been received. Review each roping's pledge policy before settling payouts.", href: `${base}/payouts#payout-finalization`, action: "Review added money" });
  if (!ropings.length) add({ id: "schedule", title: "Review the event schedule", detail: "No ropings are scheduled. Zero balances alone do not establish that an event is ready to close.", href: `${base}#setup`, action: "Review scheduled ropings" });
  return items;
}
