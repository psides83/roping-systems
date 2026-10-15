import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { loadEventReconciliation } from "@/lib/events/reconciliation-data";
import { formatCurrencyExact as money } from "@/lib/utils";
import { CloseoutReview } from "@/components/events/closeout-review";
import { closeoutReview } from "@/lib/events/closeout-review";
import { ContextHelp } from "@/components/help/context-help";
import { FinancialLabel } from "@/components/ui/financial-label";

export default async function ReconciliationPage({ params }: PageProps<"/events/[eventId]/reconciliation">) {
  const { eventId } = await params;
  const report = await loadEventReconciliation(eventId);
  if (!report) notFound();
  const { totals: t, event, ropings } = report;
  const sponsors = report.funding.filter((row) => row.source === "sponsor");
  const sponsorCommitted = sponsors.reduce((sum, row) => sum + row.amount_cents, 0);
  const sponsorReceived = sponsors.reduce((sum, row) => sum + row.received_cents, 0);
  const fundDeposits = report.transfers.filter((row) => ["entry_deposit", "entry_adjustment"].includes(row.kind)).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  const fundUsed = report.transfers.filter((row) => ["roping_allocation", "roping_return"].includes(row.kind)).reduce((sum, row) => sum - Number(row.amount_cents), 0);
  const ropingName = (id: string) => ropings.find((roping) => roping.id === id)?.name ?? "Roping";
  const review = closeoutReview({ eventId, totals: t, ropings, sponsorCommitted, sponsorReceived });
  const rows = [
    ["Entry, event & stock charges", t.assessed, t.collected, t.outstanding],
    ["Completed roping winnings", t.awarded, t.paid, t.remainingAwards],
    ["Sponsor contributions", sponsorCommitted, sponsorReceived, sponsorCommitted - sponsorReceived],
  ] as const;
  return <div className="space-y-6">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm"><Link href="/events">Events</Link><span>/</span><Link href={`/events/${eventId}`}>{event.title}</Link><span>/</span><span aria-current="page">Financial closeout</span></nav>
    <PageHeader eyebrow="Event finances" title="Financial closeout" description={`${event.title} · Review balances, payment records, and unfinished payout work.`} actions={<Link href={`/events/${eventId}`} className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><ArrowLeft size={16} />Event dashboard</Link>} />
    <ContextHelp title="What does financial closeout include?" guide="payouts"><p>This read-only report compares charges, recorded entry payments, winnings, payout receipts, and added money for this event. Entries marked paid are kept separate from cash receipts.</p><p>Internal fund transfers are ledger movements. Operating expenses and a physical cash count are outside this report.</p></ContextHelp>
    <section aria-label="Recorded payments and finalized winnings" className="border-y border-[#dfe4e1] py-5"><dl className="grid gap-5 sm:grid-cols-3">{[
      {label:"Entry & stock payments recorded",amount:t.recorded,help:"Entry and stock-charge payment receipts, net of refunds. Shown separately from fees collected, which also includes entries marked paid."},
      {label:"Payouts paid",amount:t.paid,help:"Payout amounts recorded as paid in recipient receipts. Recipient acknowledgment is tracked separately."},
      {label:"Finalized winnings",amount:t.finalizedAwards,help:"Total winnings from ropings whose payouts have been finalized, whether or not the ropers have been paid yet."},
    ].map(item => <div key={item.label}><dt className="text-sm text-[#66716b]"><FinancialLabel label={item.label} help={item.help}/></dt><dd className="mt-1 font-mono text-2xl font-bold tabular-nums">{money(item.amount)}</dd></div>)}</dl></section>
    <CloseoutReview items={review} />
    <section><h2 className="text-lg font-bold">Charges, awards & sponsor commitments</h2>
      <div className="mt-3 space-y-4 sm:hidden">{rows.map(([label, expected, recorded, outstanding]) => <div key={label} className="border-b border-[#dfe4e1] pb-3"><h3 className="text-sm font-semibold">{label}</h3><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{[["Expected", expected], ["Collected / paid", recorded], ["Outstanding", outstanding]].map(([name, amount]) => <div key={name}><dt className="text-xs text-[#66716b]">{name}</dt><dd className="font-mono tabular-nums">{money(Number(amount))}</dd></div>)}</dl></div>)}</div>
      <div className="mt-3 hidden overflow-x-auto sm:block"><table className="w-full text-sm"><thead className="bg-[#eef1ef] text-left"><tr>{["Item", "Expected", "Collected / paid", "Outstanding"].map((label) => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(([label, expected, recorded, outstanding]) => <tr key={label} className="border-b border-[#dfe4e1]"><th scope="row" className="p-3 text-left font-semibold">{label}</th>{[expected, recorded, outstanding].map((amount, index) => <td key={index} className="p-3 font-mono tabular-nums whitespace-nowrap">{money(amount)}</td>)}</tr>)}</tbody></table></div><p className="mt-3 text-sm text-[#66716b]">Charges exclude {money(t.waived)} waived. Collected fees include entries marked paid; recorded entry payments show the payment ledger separately. This is not a physical cash count or a profit statement.</p></section>
    <details className="border-y border-[#dfe4e1] py-4"><summary className="cursor-pointer font-bold">Fee breakdown</summary><div className="mt-3 space-y-3">{report.fees.map((fee, index) => <div key={index} className="flex flex-wrap justify-between gap-2 border-b border-[#dfe4e1] pb-2 text-sm"><div><p className="font-semibold">{fee.title}</p><p className="text-xs text-[#66716b]">{fee.roping_name || "Event-wide"}</p></div><span>{money(Number(fee.collected_cents))} collected · {money(Number(fee.outstanding_cents))} outstanding</span></div>)}</div><Link className="mt-3 inline-block text-sm font-semibold underline" href={`/events/${eventId}/fee-collections`}>Full fee collections</Link></details>
    <section><h2 className="text-lg font-bold">Added money</h2><div className="mt-3 space-y-3">{report.funding.length ? report.funding.map((row) => {
      const roping = ropings.find((item) => item.id === row.event_roping_id);
      const eligible = row.source === "sponsor" && !roping?.allow_pledged_sponsor_money ? row.received_cents : row.amount_cents;
      return <div key={row.id} className="border-b border-[#dfe4e1] pb-3 text-sm"><p className="font-semibold">{ropingName(row.event_roping_id)} · {row.sponsor_name || (row.source === "fund" ? row.fundName || "Fund allocation" : "Other added money")}</p><p className="mt-1 text-[#66716b]">{money(row.amount_cents)} committed · {row.source === "fund" ? "Internal allocation" : `${money(row.received_cents)} recorded received`} · {money(eligible)} included in purse</p></div>;
    }) : <p className="text-sm text-[#66716b]">No added money recorded.</p>}</div></section>
    <section className="border-y border-[#dfe4e1] py-4"><h2 className="text-lg font-bold">Internal fund movements</h2><dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3"><div><dt className="text-sm text-[#66716b]">Entry contributions deposited</dt><dd className="font-mono text-xl font-bold">{money(fundDeposits)}</dd></div><div><dt className="text-sm text-[#66716b]">Added money debited, less returns</dt><dd className="font-mono text-xl font-bold">{money(fundUsed)}</dd></div></dl><details className="mt-4"><summary className="cursor-pointer font-bold">Transfer history · {report.transfers.length}</summary><p className="mt-3 text-sm text-[#66716b]">Internal ledger movements, not additional entry receipts. Contributions post at roping completion; fund allocations are debited when payouts are finalized.</p><div className="mt-3 space-y-3">{report.transfers.map((row) => <div key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-[#dfe4e1] pb-3 text-sm"><div><p className="font-semibold">{ropingName(row.event_roping_id)}</p><p className="text-[#66716b]">{row.reason}</p><time className="text-xs text-[#66716b]">{row.created_at.slice(0, 10)}</time></div><span className="font-mono tabular-nums">{money(Number(row.amount_cents))}</span></div>)}</div></details></section>
  </div>;
}
