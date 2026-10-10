import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { FinancialLabel } from "@/components/ui/financial-label";
import { EventExpenses } from "@/components/events/event-expenses";
import { loadEventReconciliation } from "@/lib/events/reconciliation-data";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { eventProfitability, type EventExpense } from "@/lib/events/profitability";
import type { FeeCollection } from "@/lib/events/fee-collections";
import { formatCurrencyExact as money } from "@/lib/utils";

const nonPayoutHelp = "Collected production and office charges, entry stock charges, stock charge practice runs and scores, and other fees not allocated to payouts or added-money funds. These fees cover expenses. Unpaid fees are excluded. Practice purchases and office charges belong to event totals, not an individual competition roping.";
const balanceHelp = "Non-payout fees collected minus recorded expenses. A negative amount means expenses exceed those fees. This is not a bank balance or the final overall event result.";
const payoutHelp = "All calculated winnings, including amounts already paid and amounts still owed. Unpaid winnings are deducted when calculating the final amount retained.";
const netHelp = "Collected fees minus fund contributions, plus received added money and fund money used, minus all winnings and recorded expenses. Unpaid fees and unreceived pledges are not income.";

export default async function ProfitabilityPage({ params }: PageProps<"/events/[eventId]/profitability">) {
  const { eventId } = await params;
  const data = await loadEventReconciliation(eventId);
  if (!data) notFound();
  const db = await createClient();
  const expenses = await readAllRows<EventExpense>((first, last) => db.from("event_expenses").select("id,event_roping_id,category,amount_cents,note,revision,voided_at").eq("event_id", eventId).is("voided_at", null).order("created_at", { ascending: false }).order("id").range(first, last), "Unable to load expenses");
  const report = eventProfitability(data.fees as FeeCollection[], data.funding, data.transfers, data.awards, expenses, data.ropings);
  const totals = report.total;
  const metrics = [
    { label: "Non-payout fees collected", value: money(totals.nonPayoutFees), help: nonPayoutHelp },
    { label: "Recorded expenses", value: money(totals.expenseTotal), help: "Expenses entered for this event and its ropings, such as arena rental, cattle, labor, and awards. Removed expenses are excluded." },
    { label: "Non-payout fees after expenses", value: money(totals.nonPayoutFeesAfterExpenses), help: balanceHelp },
    { label: "Net retained after expenses", value: totals.netRetained === null ? "Not final" : money(totals.netRetained), help: netHelp },
  ];
  return <div className="space-y-6">
    <PageHeader eyebrow="Event finances" title="Profitability" description={data.event.title} actions={<Link href={`/events/${eventId}`} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><ArrowLeft size={16} />Event dashboard</Link>} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric => <div key={metric.label} className="rounded-md border bg-white p-4"><h2 className="text-sm text-[#66716b]"><FinancialLabel label={metric.label} help={metric.help} /></h2><p className="mt-2 text-xl font-bold tabular-nums">{metric.value}</p></div>)}</section>
    {totals.netRetained === null && <p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">The final amount retained is available after all ropings are completed and payouts finalized. Fee and expense totals update as records are entered.</p>}
    <section className="border-y py-4"><h2 className="font-bold">Money breakdown</h2><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
      <Line label="All fees collected" amount={totals.collected} help="All collected entry fees, event-wide charges, and stock charge practice purchases, including money allocated to payouts and added-money funds. This is not the amount the producer keeps." />
      <Line label="Non-payout fees collected" amount={totals.nonPayoutFees} help={nonPayoutHelp} />
      <Line label="Fees allocated to payout pots" amount={totals.payoutFees} help="Collected fees assigned to the main purse, side pots, or insurance pots. These are not available to cover producer expenses." />
      <Line label="Fees allocated to added-money funds" amount={totals.fundContributions} help="Collected contributions reserved for added-money funds, even if the deposit has not posted yet. Excluded from non-payout fees and retained profit." />
      <Line label="Sponsor and other added money received" amount={totals.receivedAddedMoney} />
      <Line label="Fund money used for payouts" amount={totals.fundMoneyUsed} help="Actual fund withdrawals for these ropings, minus money returned to the funds. This offsets payouts; it is not fee income." />
      <Line label="Total winnings" amount={totals.payoutTotal} help={payoutHelp} />
      <Line label="Payouts paid" amount={data.totals.paid} />
      <Line label="Payouts still owed" amount={totals.payoutRemaining} />
      <Line label="Fees still unpaid" amount={totals.outstandingFees} />
      <Line label="Sponsor pledges not yet received" amount={totals.sponsorOutstanding} />
    </dl></section>
    {!!data.totals.payoutDifference && <p role="alert" className="text-sm text-amber-800">Payout receipts and award totals differ. Review the <Link href={`/events/${eventId}/reconciliation`} className="underline">financial closeout</Link>.</p>}
    <EventExpenses eventId={eventId} expenses={expenses} ropings={data.ropings} />
    <section className="border-t pt-5"><h2 className="text-lg font-bold">By roping</h2><p className="mt-1 text-sm text-[#66716b]">Shared event expenses: {money(report.sharedExpenses)}. These reduce the event totals only; they are not deducted again from individual ropings.</p><div className="mt-3 divide-y">{report.ropings.map(roping => <details key={roping.id} className="py-4"><summary className="flex cursor-pointer flex-wrap justify-between gap-2 text-sm font-semibold"><span>{roping.name}</span><span className="tabular-nums">{roping.netRetained === null ? "Not final" : `${money(roping.netRetained)} net retained`}</span></summary><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
      <Line label="Non-payout fees collected" amount={roping.nonPayoutFees} help={nonPayoutHelp} />
      <Line label="Roping expenses" amount={roping.expenseTotal} />
      <Line label="Non-payout fees after roping expenses" amount={roping.nonPayoutFeesAfterExpenses} help="This roping's non-payout fees minus its direct expenses. Shared event expenses are deducted only from event totals." />
      <Line label="All fees collected" amount={roping.collected} />
      <Line label="Fees allocated to payout pots" amount={roping.payoutFees} />
      <Line label="Fees allocated to added-money funds" amount={roping.fundContributions} />
      <Line label="Added money received" amount={roping.receivedAddedMoney} />
      <Line label="Fund money used for payouts" amount={roping.fundMoneyUsed} />
      <Line label="Total winnings" amount={roping.payoutTotal} help={payoutHelp} />
    </dl></details>)}</div></section>
  </div>;
}
function Line({ label, amount, help }: { label: string; amount: number; help?: string }) {
  return <div className="flex flex-wrap justify-between gap-2 text-sm"><dt className="text-[#66716b]">{help ? <FinancialLabel label={label} help={help} /> : label}</dt><dd className="font-semibold tabular-nums">{money(amount)}</dd></div>;
}
