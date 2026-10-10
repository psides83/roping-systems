import { ChevronDown, CircleDollarSign } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { FeeCollection } from "@/lib/events/fee-collections";
import { getEventFeeCollections } from "@/lib/events/fee-collections-data";
import { feeCollectionAllocations } from "@/lib/events/fee-collections";
import { FinancialLabel } from "@/components/ui/financial-label";

export async function EventFeeSummary({ eventId }: { eventId: string }) {
  const db = await createClient();
  const fees = await getEventFeeCollections(eventId);
  const allocations = feeCollectionAllocations(fees);
  const schedule = await db.from("event_ropings").select("id, scheduled_date").eq("event_id", eventId);
  if (schedule.error) throw new Error("Unable to load fee collections.");
  const dates = new Map((schedule.data ?? []).map((row) => [row.id, row.scheduled_date as string]));
  const sum = (rows: FeeCollection[], field: "collected_cents" | "outstanding_cents") =>
    rows.reduce((total, row) => total + Number(row[field]), 0);
  const stockFees = fees.filter((fee) => fee.kind.startsWith("stock_charge_"));
  const eventFees = fees.filter((fee) => !fee.event_roping_id && !fee.kind.startsWith("stock_charge_"));
  const entryFees = fees.filter((fee) => fee.event_roping_id);
  const itemized = new Map<string, FeeCollection>();
  for (const fee of entryFees) {
    const key = `${fee.title.toLowerCase()}|${fee.kind}|${fee.contributes_to_payout}`;
    const row = itemized.get(key);
    if (row) {
      row.assessed_cents = Number(row.assessed_cents) + Number(fee.assessed_cents);
      row.waived_cents = Number(row.waived_cents) + Number(fee.waived_cents);
      row.collected_cents = Number(row.collected_cents) + Number(fee.collected_cents);
      row.outstanding_cents = Number(row.outstanding_cents) + Number(fee.outstanding_cents);
      row.charge_count = Number(row.charge_count) + Number(fee.charge_count);
    } else {
      itemized.set(key, { ...fee, fee_id: key, assessed_cents: Number(fee.assessed_cents), waived_cents: Number(fee.waived_cents), collected_cents: Number(fee.collected_cents), outstanding_cents: Number(fee.outstanding_cents), charge_count: Number(fee.charge_count) });
    }
  }
  const groups = new Map<string, { name: string; fees: FeeCollection[] }>();
  for (const fee of entryFees) {
    const id = fee.event_roping_id!;
    const date = dates.get(id);
    const dateLabel = date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "";
    const group = groups.get(id) ?? { name: `${fee.roping_name ?? "Roping"}${dateLabel ? ` · ${dateLabel}` : ""}`, fees: [] };
    group.fees.push(fee);
    groups.set(id, group);
  }
  return (
    <section aria-labelledby="fee-collections-heading" className="border-y border-[#dfe4e1] py-5">
      <h2 id="fee-collections-heading" className="flex items-center gap-2 font-bold">
        <CircleDollarSign size={18} /> Fee collections
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total collected", sum(fees, "collected_cents")],
          ["Entry fees collected", sum(entryFees, "collected_cents")],
          ["Event fees collected", sum(eventFees, "collected_cents")],
          ...(stockFees.length ? [["Stock charge purchases collected", sum(stockFees, "collected_cents")]] : []),
          ["Fees still unpaid", sum(fees, "outstanding_cents")],
        ].map(([label, amount]) => (
          <div key={label}>
            <dt className="text-xs font-semibold text-[#66716b]">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-bold tabular-nums">{formatCurrency(Number(amount))}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-5 grid gap-4 border-t border-[#dfe4e1] pt-4 sm:grid-cols-3">
        {[
          { label: "Non-payout fees collected", amount: allocations.nonPayoutFees, help: "Production, stock, office, and other collected fees not allocated to payouts or added-money funds. Used to cover expenses; this is before expenses, not profit." },
          { label: "Fees allocated to payout pots", amount: allocations.payoutFees, help: "Collected main purse, side pot, and insurance fees. Reserved for winnings, not producer expenses." },
          { label: "Fees allocated to added-money funds", amount: allocations.fundContributions, help: "Collected fund contributions, including deposits not yet posted. Separate from non-payout fees and profit." },
        ].map(item => <div key={item.label}><dt className="text-xs font-semibold text-[#66716b]"><FinancialLabel label={item.label} help={item.help}/></dt><dd className="mt-1 font-mono text-lg font-bold tabular-nums">{formatCurrency(item.amount)}</dd></div>)}
      </dl>
      {eventFees.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-bold">Event-wide fees</h3><FeeTable fees={eventFees} /></div> : null}
      {stockFees.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-bold">Stock charge runs & scores</h3><FeeTable fees={stockFees} /></div> : null}
      {entryFees.length ? <div className="mt-5"><h3 className="mb-2 text-sm font-bold">Entry fees across all ropings</h3><FeeTable fees={Array.from(itemized.values())} /></div> : null}
      <details className="mt-4 border-t border-[#dfe4e1]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
          By roping <span className="flex items-center gap-2 text-xs font-normal text-[#66716b]">{groups.size} ropings <ChevronDown size={16} /></span>
        </summary>
        <div className="divide-y divide-[#dfe4e1]">
        {Array.from(groups, ([id, group]) => (
          <details key={id} className="group py-2">
            <summary className="flex cursor-pointer list-none items-center gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">{group.name}</span>
              <span className="shrink-0 font-mono tabular-nums">{formatCurrency(sum(group.fees, "collected_cents"))}</span>
              <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <FeeTable fees={group.fees} />
          </details>
        ))}
        </div>
      </details>
      {fees.some((fee) => fee.partial_payments) ? (
        <p className="mt-3 text-xs text-[#66716b]">Partial cash payments are allocated to event-wide fees first, then entry charges in the order created.</p>
      ) : null}
    </section>
  );
}

function FeeTable({ fees }: { fees: FeeCollection[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[#dfe4e1] text-xs text-[#66716b]">
          <tr><th className="py-2 pr-4">Fee</th><th className="px-3 py-2 text-right">Charged</th><th className="px-3 py-2 text-right">Collected</th><th className="py-2 pl-3 text-right">Still unpaid</th></tr>
        </thead>
        <tbody className="divide-y divide-[#edf0ee]">
          {fees.map((fee) => (
            <tr key={fee.fee_id}>
              <td className="py-3 pr-4"><span className="font-semibold">{fee.title}</span>
                <p className="mt-1 text-xs text-[#758078]">{fee.kind === "added_money" ? "Added-money fund contribution" : fee.kind === "side_pot" ? "Side pot" : fee.kind === "insurance" ? "Insurance pot" : fee.contributes_to_payout ? "Main payout purse" : `Non-payout fee · ${fee.charge_count} charges`}
                  {Number(fee.waived_cents) > 0 ? ` · ${formatCurrency(Number(fee.waived_cents))} waived` : ""}</p>
              </td>
              <td className="px-3 py-3 text-right font-mono tabular-nums">{formatCurrency(Number(fee.assessed_cents))}</td>
              <td className="px-3 py-3 text-right font-mono font-semibold tabular-nums">{formatCurrency(Number(fee.collected_cents))}</td>
              <td className="py-3 pl-3 text-right font-mono tabular-nums">{formatCurrency(Number(fee.outstanding_cents))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
