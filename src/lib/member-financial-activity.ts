import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { activityMoney as money, type MemberActivity } from "@/lib/member-activity";
interface Receipt {
  id: string; event_id: string; amount_cents: number; payment_method: string; received_by: string; receipt_confirmed: boolean;
  confirmed_at: string | null; paid_at: string; paid_by_label: string; reversed_at: string | null; reversal_reason: string | null;
  payout_receipt_awards: { amount_cents: number; event_ropings: { name: string }; event_roping_payout_plans: { name: string; pool_type: string } }[];
}

export async function loadMemberFinancialActivity(db: Awaited<ReturnType<typeof createClient>>, producerId: string, memberId: string, roperId: string) {
  const items: MemberActivity[] = [];
  const href = `/members/${memberId}`;
  const fines = await readAllRows<{ id: string; amount_cents: number; reason: string; restriction: string; issued_at: string; issued_by_label: string;
    member_fine_transactions: { id: string; kind: string; amount_cents: number; reason: string; created_at: string; staff_label: string }[] }>((first, last) => db.from("member_fines")
    .select("id,amount_cents,reason,restriction,issued_at,issued_by_label,member_fine_transactions(id,kind,amount_cents,reason,created_at,staff_label)")
    .eq("producer_id", producerId).eq("membership_id", memberId).order("issued_at").order("id").range(first, last), "Unable to load fine activity");
  for (const fine of fines) {
    items.push({ id: `fine:${fine.id}`, type: "fine", occurredAt: fine.issued_at, title: "Fine issued", summary: `${money(fine.amount_cents)} · ${fine.reason}`,
      details: [`Restriction: ${fine.restriction}`, `Recorded by ${fine.issued_by_label}`], staffOnly: true, href });
    for (const transaction of fine.member_fine_transactions) items.push({ id: `fine-payment:${transaction.id}`, type: "fine", occurredAt: transaction.created_at,
      title: { payment: "Fine payment recorded", waiver: "Fine waived", reversal: "Fine payment or waiver reversed" }[transaction.kind] ?? "Fine transaction",
      summary: `${money(transaction.amount_cents)} · ${transaction.reason}`, details: [`Recorded by ${transaction.staff_label}`], staffOnly: true, href });
  }
  const dues = await readAllRows<{ id: string; season_id: string; amount_cents: number; created_at: string;
    membership_dues_payments: { id: string; amount_cents: number; contributed_cents: number; method: string; reason: string; created_at: string; staff_label: string }[] }>((first, last) => db.from("membership_dues")
    .select("id,season_id,amount_cents,created_at,membership_dues_payments(id,amount_cents,contributed_cents,method,reason,created_at,staff_label)")
    .eq("producer_id", producerId).eq("membership_id", memberId).order("created_at").order("id").range(first, last), "Unable to load dues activity");
  for (const account of dues) {
    const duesHref = `/members/dues?member=${memberId}&season=${account.season_id}`;
    const paid = account.membership_dues_payments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
    items.push({ id: `dues:${account.id}`, type: "dues", occurredAt: account.created_at, title: "Season membership dues assessed",
      summary: `${money(Number(account.amount_cents))} · ${money(Number(account.amount_cents) - paid)} currently outstanding`, details: [], staffOnly: true, seasonId: account.season_id, href: duesHref });
    for (const payment of account.membership_dues_payments) items.push({ id: `dues-payment:${payment.id}`, type: "dues", occurredAt: payment.created_at,
      title: payment.method === "reversal" ? "Dues payment reversed" : "Membership dues paid", summary: `${money(Math.abs(Number(payment.amount_cents)))} · ${payment.method}`,
      details: [payment.reason, `Fund contribution: ${money(Number(payment.contributed_cents))}`, `Recorded by ${payment.staff_label}`], staffOnly: true, seasonId: account.season_id, href: duesHref });
  }
  const receipts = await readAllRows<Receipt>((first, last) => db.from("payout_receipts")
    .select("id,event_id,amount_cents,payment_method,received_by,receipt_confirmed,confirmed_at,paid_at,paid_by_label,reversed_at,reversal_reason,payout_receipt_awards(amount_cents,event_ropings!event_roping_id(name),event_roping_payout_plans!payout_plan_id(name,pool_type))")
    .eq("producer_id", producerId).eq("roper_id", roperId).order("paid_at").order("id").range(first, last) as unknown as PromiseLike<{ data: Receipt[] | null; error: { message: string } | null }>, "Unable to load payout activity");
  for (const receipt of receipts) {
    const payoutHref = `/events/${receipt.event_id}/payouts`;
    items.push({ id: `payout:${receipt.id}`, type: "payout", occurredAt: receipt.paid_at, title: "Payout recorded", summary: `${money(receipt.amount_cents)} · ${receipt.payment_method}`,
      details: [`Received by ${receipt.received_by}`, `Recorded by ${receipt.paid_by_label}`, receipt.receipt_confirmed ? "Receipt acknowledged" : "Receipt acknowledgment pending",
        ...receipt.payout_receipt_awards.map(award => `${award.event_ropings.name} · ${award.event_roping_payout_plans.name}: ${money(award.amount_cents)}`)], staffOnly: true, href: payoutHref });
    if (receipt.confirmed_at) items.push({ id: `acknowledgment:${receipt.id}`, type: "payout", occurredAt: receipt.confirmed_at, title: "Payout receipt acknowledged",
      summary: `${money(receipt.amount_cents)} · ${receipt.received_by}`, details: [], staffOnly: true, href: payoutHref });
    if (receipt.reversed_at) items.push({ id: `payout-reversal:${receipt.id}`, type: "payout", occurredAt: receipt.reversed_at, title: "Payout reversed",
      summary: money(receipt.amount_cents), details: [receipt.reversal_reason ?? ""], staffOnly: true, href: payoutHref });
  }
  return items;
}
