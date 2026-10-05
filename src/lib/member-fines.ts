export type FineRestriction = "none" | "entry" | "competition" | "both";
export const fineRestrictionLabels: Record<FineRestriction, string> = {
  none: "No entry or competition restriction",
  entry: "Blocks new entries",
  competition: "Blocks competition in the next separate roping",
  both: "Blocks new entries and competition in the next separate roping",
};
export interface FineTransaction {
  id: string; kind: "payment" | "waiver" | "reversal"; amountCents: number;
  reason: string; reversesId: string | null; createdAt: string; staff: string;
}
export interface FineException {
  id: string; ropingId: string | null; expiresAt: string; reason: string;
  createdAt: string; staff: string; revokedAt: string | null; revocationReason: string | null;
}
export interface MemberFine {
  id: string; amountCents: number; reason: string; restriction: FineRestriction;
  issuedAt: string; staff: string; transactions: FineTransaction[]; exceptions: FineException[];
}
export function fineBalance(fine: Pick<MemberFine, "amountCents" | "transactions">) {
  return fine.amountCents - fine.transactions.reduce((sum, transaction) =>
    sum + (transaction.kind === "reversal" ? -transaction.amountCents : transaction.amountCents), 0);
}
export function fineStatus(fine: MemberFine) {
  const balance = fineBalance(fine);
  if (balance === 0) {
    const reversed = new Set(fine.transactions.filter((transaction) => transaction.kind === "reversal").map((transaction) => transaction.reversesId));
    return fine.transactions.some((transaction) => transaction.kind === "waiver" && !reversed.has(transaction.id)) ? "Settled" : "Paid";
  }
  return balance < fine.amountCents ? "Partially settled" : "Unpaid";
}
export function moneyInputCents(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2147483647 ? cents : null;
}
