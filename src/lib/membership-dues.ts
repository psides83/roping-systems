export interface DuesSettings {
  amount_cents: number; installments: boolean; allocation_mode: "fixed" | "percent";
  allocation_value: number; fund_id: string | null; revision: number;
}
export interface DuesPayment {
  id: string; amount_cents: number; contributed_cents: number; method: string;
  reason: string; reverses_id: string | null; created_at: string; staff_label: string;
}
export interface DuesAccount {
  id: string; membership_id: string; season_id: string; amount_cents: number;
  installments: boolean; allocation_cents: number; fund_id: string | null; payments: DuesPayment[];
}
export function duesTotals(accounts: DuesAccount[]) {
  const charged = accounts.reduce((sum, account) => sum + Number(account.amount_cents), 0);
  const payments = accounts.flatMap((account) => account.payments);
  const collected = payments.reduce((sum, item) => sum + Number(item.amount_cents), 0);
  const contributed = payments.reduce((sum, item) => sum + Number(item.contributed_cents), 0);
  return { charged, collected, outstanding: charged - collected, contributed, retained: collected - contributed };
}
export function duesContribution(paid: number, total: number, allocation: number) {
  if (![paid, total, allocation].every(Number.isSafeInteger) || total <= 0 || paid < 0 || paid > total || allocation < 0 || allocation > total) throw new Error("Invalid dues amounts");
  // Integer arithmetic matches PostgreSQL numeric rounding at cent boundaries.
  return Number((BigInt(paid) * BigInt(allocation) * BigInt(2) + BigInt(total)) / (BigInt(total) * BigInt(2)));
}
export function nonnegativeMoney(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 2147483647 ? amount : null;
}
