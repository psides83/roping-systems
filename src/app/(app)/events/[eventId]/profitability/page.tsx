import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {PageHeader} from "@/components/ui/page-header";
import {EventExpenses} from "@/components/events/event-expenses";
import {loadEventReconciliation} from "@/lib/events/reconciliation-data";
import {createClient} from "@/lib/supabase/server";
import {readAllRows} from "@/lib/supabase/read-all-rows";
import {eventProfitability,type EventExpense} from "@/lib/events/profitability";
import type {FeeCollection} from "@/lib/events/fee-collections";
import {formatCurrency} from "@/lib/utils";

export default async function ProfitabilityPage({params}:PageProps<"/events/[eventId]/profitability">) {
  const {eventId}=await params;
  const data=await loadEventReconciliation(eventId);
  if(!data)notFound();
  const db=await createClient();
  const expenses=await readAllRows<EventExpense>((first,last)=>db.from("event_expenses").select("id,event_roping_id,category,amount_cents,note,revision,voided_at").eq("event_id",eventId).is("voided_at",null).order("created_at",{ascending:false}).order("id").range(first,last),"Unable to load expenses");
  const report=eventProfitability(data.fees as FeeCollection[],data.funding,data.transfers,data.awards,expenses,data.ropings);
  const totals=report.total;
  const metrics=[{label:"Collected entry fees",value:formatCurrency(totals.collected)},{label:"Payout obligation",value:formatCurrency(totals.payoutTotal)},{label:"Recorded expenses",value:formatCurrency(totals.expenseTotal)},{label:"Net retained",value:totals.netRetained===null?"Not final":formatCurrency(totals.netRetained)}];
  return <div className="space-y-6"><PageHeader eyebrow="Event finances" title="Profitability" description={data.event.title} actions={<Link href={`/events/${eventId}`} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><ArrowLeft size={16}/>Event dashboard</Link>}/>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric=><div key={metric.label} className="rounded-md border bg-white p-4"><h2 className="text-sm text-[#66716b]">{metric.label}</h2><p className="mt-2 text-xl font-bold tabular-nums">{metric.value}</p></div>)}</section>
    {totals.netRetained===null&&<p className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">Net retained is available after all ropings are completed and their payouts finalized.</p>}
    <section className="border-y py-4"><h2 className="font-bold">Money breakdown</h2><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2"><Line label="Entry fees collected" amount={totals.collected}/><Line label="Fund contributions excluded" amount={totals.fundContributions}/><Line label="Sponsor / other added money received" amount={totals.receivedAddedMoney}/><Line label="Fund money used for payouts" amount={totals.fundMoneyUsed}/><Line label="Payouts already paid" amount={data.totals.paid}/><Line label="Payouts remaining" amount={totals.payoutRemaining}/><Line label="Entry fees still outstanding" amount={totals.outstandingFees}/><Line label="Sponsor pledges still outstanding" amount={totals.sponsorOutstanding}/></dl><p className="mt-4 text-xs leading-5 text-[#66716b]">Net retained = collected fees − fund contributions + received added money + fund money used − all payout obligations − recorded expenses. Outstanding fees and sponsor pledges are not counted as income.</p></section>
    {!!data.totals.payoutDifference&&<p role="alert" className="text-sm text-amber-800">Payout receipts and award totals differ. Review the <Link href={`/events/${eventId}/reconciliation`} className="underline">financial closeout</Link>.</p>}
    <EventExpenses eventId={eventId} expenses={expenses} ropings={data.ropings}/>
    <section className="border-t pt-5"><h2 className="text-lg font-bold">By roping</h2><p className="mt-1 text-sm text-[#66716b]">Shared event expenses: {formatCurrency(report.sharedExpenses)}. These are deducted only from the event total.</p><div className="mt-3 divide-y">{report.ropings.map(roping=><details key={roping.id} className="py-4"><summary className="flex cursor-pointer flex-wrap justify-between gap-2 text-sm font-semibold"><span>{roping.name}</span><span className="tabular-nums">{roping.netRetained===null?"Not final":`${formatCurrency(roping.netRetained)} retained`}</span></summary><dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2"><Line label="Collected fees" amount={roping.collected}/><Line label="Fund contributions excluded" amount={roping.fundContributions}/><Line label="Received added money" amount={roping.receivedAddedMoney}/><Line label="Fund money used" amount={roping.fundMoneyUsed}/><Line label="Payout obligation" amount={roping.payoutTotal}/><Line label="Direct expenses" amount={roping.expenseTotal}/></dl></details>)}</div></section>
  </div>;
}
function Line({label,amount}:{label:string;amount:number}) {return <div className="flex flex-wrap justify-between gap-2 text-sm"><dt className="text-[#66716b]">{label}</dt><dd className="font-semibold tabular-nums">{formatCurrency(amount)}</dd></div>;}
