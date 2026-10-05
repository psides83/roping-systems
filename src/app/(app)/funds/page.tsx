import Link from "next/link";
import { Filter, PiggyBank, ChevronDown } from "lucide-react";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { seasonCalendarDate } from "@/lib/seasons";
import { addedMoneyFunds, type AddedMoneyContribution } from "@/lib/added-money";

export default async function FundsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const supabase = await createClient();
  const { data: seasons, error: seasonError } = await supabase.from("producer_seasons")
    .select("id, name, starts_on, ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  if (seasonError) throw new Error(`Unable to load seasons: ${seasonError.message}`);
  const today = seasonCalendarDate(new Date().toISOString(), producer.timezone)!;
  const params = await searchParams;
  const current = seasons?.find((season) => today >= season.starts_on && today <= season.ends_on);
  const selected = params.season === "all" ? undefined : seasons?.find((season) => season.id === (params.season ?? current?.id));
  const { data, error } = await supabase.rpc("producer_added_money_contributions", {
    target_producer_id: producer.id, target_start: selected?.starts_on ?? null, target_end: selected?.ends_on ?? null,
  });
  if (error) throw new Error(`Unable to load added-money funds: ${error.message}`);
  const funds = addedMoneyFunds((data ?? []) as AddedMoneyContribution[]);
  const collected = funds.reduce((total, fund) => total + fund.collected, 0);
  const pending = funds.reduce((total, fund) => total + fund.pending, 0);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><PiggyBank size={24} />Added-money funds</h1>
      <form className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold text-[#66716b]">Season<select name="season" defaultValue={selected?.id ?? "all"} className="h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm text-[#19231d]">
          <option value="all">All seasons</option>{seasons?.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
        </select></label>
        <button aria-label="Apply season filter" title="Apply season filter" className="grid h-10 w-10 place-items-center rounded-md border border-[#ccd4d0] bg-white"><Filter size={17} /></button>
      </form>
    </header>
    <section className="flex flex-wrap gap-x-12 gap-y-4 border-y border-[#dfe4e1] py-5">
      <div><p className="text-sm text-[#66716b]">Collected contributions</p><p className="mt-1 text-2xl font-bold">{formatCurrency(collected)}</p></div>
      <div><p className="text-sm text-[#66716b]">Unpaid contributions</p><p className="mt-1 text-2xl font-bold">{formatCurrency(pending)}</p></div>
      <div><p className="text-sm text-[#66716b]">Funds</p><p className="mt-1 text-2xl font-bold">{funds.length}</p></div>
    </section>
    {!funds.length ? <div className="py-8"><h2 className="font-bold">No added-money contributions in this period</h2><Link href="/settings/roping-templates" className="mt-3 inline-block text-sm font-semibold text-[var(--brand-accent-strong)]">Roping templates</Link></div> : null}
    <div className="divide-y divide-[#dfe4e1]">{funds.map((fund) => <details key={fund.key} className="group py-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" />
        <span className="min-w-0 flex-1 font-bold">{fund.label}<span className="mt-1 block text-xs font-normal text-[#66716b]">{fund.entries} paid fee contributions</span></span>
        <span className="text-right"><span className="block text-lg font-bold">{formatCurrency(fund.collected)}</span><span className="block text-xs text-[#66716b]">{formatCurrency(fund.pending)} unpaid</span></span>
      </summary>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-[#dfe4e1] text-xs uppercase text-[#758078]"><tr><th className="py-3 pr-4">Date</th><th className="py-3 pr-4">Event / Fee</th><th className="py-3 pr-4 text-right">Paid entries</th><th className="py-3 pr-4 text-right">Collected</th><th className="py-3 text-right">Unpaid</th></tr></thead>
        <tbody className="divide-y divide-[#e7ebe8]">{fund.rows.map((row, index) => <tr key={`${row.event_id}-${row.roping_date}-${row.fee_title}-${index}`}>
          <td className="py-3 pr-4">{row.roping_date}</td><td className="py-3 pr-4"><Link href={`/events/${row.event_id}`} className="font-semibold hover:underline">{row.event_title}</Link><p className="mt-1 text-xs text-[#66716b]">{row.fee_title}</p></td><td className="py-3 pr-4 text-right">{row.paid_entries}</td><td className="py-3 pr-4 text-right font-semibold">{formatCurrency(Number(row.collected_cents))}</td><td className="py-3 text-right text-[#66716b]">{formatCurrency(Number(row.pending_cents))}</td>
        </tr>)}</tbody>
      </table></div>
    </details>)}</div>
  </div>;
}
