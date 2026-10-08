import type { BalanceEntry, BalanceCharge, BalancePayment } from "./entry-balance";

export interface RoperAccountEvent {
  id: string; title: string; startsAt: string;
  entries: (BalanceEntry & { number: number; name: string; division: string | null })[];
  charges: (BalanceCharge & { id: string; title: string })[];
  payments: (BalancePayment & { id: string; method: string; receivedAt: string })[];
}
export interface RoperSubmission {
  id: string; status: "pending" | "accepted" | "declined" | "withdrawn";
  revision?: number; canModify?: boolean; producerSlug?: string; eventSlug?: string;
  changes?: { action: "edited" | "withdrawn"; changedAt: string }[];
  submittedAt: string; reviewedAt: string | null; eventTitle: string;
  items: { name: string; division: string | null; date: string; quantity: number }[];
}
export interface RoperAccounts { timezone: string; events: RoperAccountEvent[]; submissions: RoperSubmission[] }

export function formatAccountMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
