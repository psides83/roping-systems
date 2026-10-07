import { ChevronDown } from "lucide-react";
import { calculateEntryBalance } from "@/lib/entry-balance";
import { formatEntryLabel, type EntryLabelStyle } from "@/lib/entry-labels";
import { formatAccountMoney, type RoperAccountEvent } from "@/lib/roper-accounts";

export function PortalBalances({ events, style, timezone }: { events: RoperAccountEvent[]; style: EntryLabelStyle; timezone: string }) {
  const accounts = events.map((event) => ({ ...event, balance: calculateEntryBalance(event.entries, event.charges, event.payments) }));
  accounts.sort((a, b) => Number(b.balance.balanceDueCents > 0) - Number(a.balance.balanceDueCents > 0) || b.startsAt.localeCompare(a.startsAt));
  const due = accounts.reduce((sum, event) => sum + event.balance.balanceDueCents, 0);
  return <section className="space-y-4" aria-label="Event balances">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Event balances</h2><p className="text-sm text-[#66716b]">Total due <strong className="ml-2 text-lg text-[#19231d]">{formatAccountMoney(due)}</strong></p></div>
    {!accounts.length ? <p className="py-6 text-sm text-[#66716b]">No event charges or payments yet.</p> : null}
    {accounts.map((event) => <details key={event.id} className="group border-b border-[#dfe4e1]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><h3 className="break-words font-semibold">{event.title}</h3><p className="mt-1 text-xs text-[#66716b]">{event.balance.balanceDueCents ? "Payment due" : event.balance.creditCents ? "Credit on record" : "No balance due"}</p></div><span className="flex items-center gap-3 font-semibold">{formatAccountMoney(event.balance.balanceDueCents)} due<ChevronDown size={18} className="transition-transform group-open:rotate-180" /></span></summary>
      <div className="space-y-5 pb-5">
        <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm"><div><dt className="text-[#66716b]">Payable charges</dt><dd className="font-semibold">{formatAccountMoney(event.balance.amountDueCents)}</dd></div><div><dt className="text-[#66716b]">{event.balance.markedPaid ? "Marked paid by staff" : "Payments recorded"}</dt><dd className="font-semibold">{formatAccountMoney(event.balance.amountPaidCents)}</dd></div>{event.balance.creditCents > 0 ? <div><dt className="text-[#66716b]">Credit on record</dt><dd className="font-semibold">{formatAccountMoney(event.balance.creditCents)}</dd></div> : null}</dl>
        <section><h4 className="text-sm font-semibold">Fee breakdown</h4><ul className="mt-2 divide-y divide-[#e7ebe9]">{event.charges.map((charge) => {
          const entry = event.entries.find((item) => item.id === charge.entryId);
          const billable = event.balance.billable(charge);
          const description = charge.entryId ? entry ? `${entry.name}${entry.division ? ` · ${entry.division}` : ""} · Entry ${style === "number" ? "#" : ""}${formatEntryLabel(entry.number, style)}` : "Removed entry" : "Once per event";
          return <li key={charge.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words font-medium">{charge.title}</p><p className="mt-1 break-words text-xs text-[#66716b]">{description}{!billable ? ` · ${charge.waived ? "Waived" : "Not payable"}` : ""}</p></div><span className={`shrink-0 tabular-nums ${billable ? "" : "text-[#66716b] line-through"}`}>{formatAccountMoney(charge.amountCents)}</span></li>;
        })}</ul>{!event.charges.length ? <p className="mt-2 text-sm text-[#66716b]">No itemized charges.</p> : null}</section>
        <section><h4 className="text-sm font-semibold">Payment history</h4>{event.payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(payment.receivedAt))} · {payment.method === "cash" ? "Cash" : payment.method}{payment.voided ? " · Voided" : ""}</span><span className={`tabular-nums ${payment.voided ? "text-[#66716b] line-through" : "font-semibold"}`}>{formatAccountMoney(payment.amountCents)}</span></div>)}{!event.payments.length ? <p className="mt-2 text-sm text-[#66716b]">{event.balance.markedPaid ? "Staff marked the entries paid; no separate payment receipt was recorded." : "No payments recorded."}</p> : null}</section>
      </div>
    </details>)}
  </section>;
}
