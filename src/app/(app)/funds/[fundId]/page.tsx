import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { formatCurrency } from "@/lib/utils";
import { FundDialog } from "@/components/funds/fund-dialog";
export default async function FundPage({ params,searchParams }: { params: Promise<{ fundId: string }>; searchParams: Promise<{ page?: string }> }) {
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const { fundId } = await params;
  const page = Math.max(0,Math.min(100000,Number.parseInt((await searchParams).page ?? "0",10)||0));
  const supabase = await createClient();
  const { data: fund,error } = await supabase.from("producer_funds").select("id,name,description,is_active").eq("id",fundId).eq("producer_id",producer.id).single();
  if (error || !fund) notFound();
  const { data: balances,error: balanceError } = await supabase.rpc("producer_fund_availability",{ target_producer_id: producer.id });
  const { data: rows,error: ledgerError } = await supabase.rpc("producer_fund_ledger",{ target_fund_id: fundId,target_offset: page*100 });
  if (ledgerError || balanceError) throw new Error("Unable to load the fund ledger.");
  const balance = balances?.find((row: { id: string }) => row.id===fundId)?.balance_cents ?? 0;
  const availability = balances?.find((row: { id: string }) => row.id===fundId);
  const canManage = producer.role!=="viewer";
  const labels: Record<string,string> = { entry_deposit: "Roping contribution deposit",entry_adjustment: "Roping contribution adjustment",manual_deposit: "Manual deposit",manual_debit: "Manual debit",reversal: "Reversal",roping_allocation: "Added money used at roping",roping_return: "Added money returned on reopening" };
  return <div className="space-y-5"><Link href="/funds" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />Funds</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{fund.name}</h1><p className="mt-2 text-sm text-[#66716b]">{fund.description}</p>{!fund.is_active ? <span className="mt-2 inline-block rounded bg-[#eef1ef] px-2 py-1 text-xs font-semibold">Archived</span> : null}</div>{canManage ? <FundDialog operation="edit" fund={fund} /> : null}</header>
    <section className="flex flex-wrap items-center justify-between gap-4 border-y border-[#dfe4e1] py-5"><div><p className="text-sm text-[#66716b]">Account balance</p><p className={`mt-1 text-2xl font-bold ${Number(balance)<0 ? "text-red-700" : ""}`}>{formatCurrency(Number(balance))}</p><p className="mt-2 text-sm text-[#66716b]">{formatCurrency(Number(availability?.reserved_cents ?? 0))} reserved · {formatCurrency(Number(availability?.available_cents ?? 0))} available</p></div>{canManage && fund.is_active ? <div className="flex flex-wrap gap-2"><FundDialog operation="manual_deposit" fund={fund} /><FundDialog operation="manual_debit" fund={fund} /></div> : null}</section>
    <section><h2 className="text-lg font-bold">Transactions</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-[#dfe4e1] text-xs uppercase text-[#758078]"><tr><th className="py-3 pr-4">Date</th><th className="py-3 pr-4">Transaction / Reason</th><th className="py-3 pr-4 text-right">Deposit</th><th className="py-3 pr-4 text-right">Debit</th><th className="py-3 pr-4 text-right">Balance</th><th className="py-3"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody className="divide-y divide-[#e7ebe8]">{(rows ?? []).map((row: { id: string;kind: string;reason: string;created_at: string;staff_label: string;amount_cents: number;balance_cents: number;event_id: string|null;event_roping_id: string|null;roping_name: string|null;event_title: string|null;reversed: boolean }) => <tr key={row.id}><td className="py-4 pr-4 align-top">{new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:producer.timezone}).format(new Date(row.created_at))}</td><td className="max-w-md py-4 pr-4"><p className="font-semibold">{labels[row.kind]}{row.reversed ? " / Reversed" : ""}</p>{row.event_id ? <Link href={`/events/${row.event_id}`} className="mt-1 block text-xs text-[var(--brand-accent-strong)]">{row.event_title} / {row.roping_name}</Link> : null}<p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#66716b]">{row.reason}</p><p className="mt-1 break-words text-xs text-[#758078]">{row.staff_label}</p></td><td className="py-4 pr-4 text-right align-top">{Number(row.amount_cents)>0 ? formatCurrency(Number(row.amount_cents)) : "-"}</td><td className="py-4 pr-4 text-right align-top">{Number(row.amount_cents)<0 ? formatCurrency(-Number(row.amount_cents)) : "-"}</td><td className="py-4 pr-4 text-right align-top font-semibold">{formatCurrency(Number(row.balance_cents))}</td><td className="py-4 align-top">{canManage && !row.reversed && ["manual_deposit","manual_debit"].includes(row.kind) ? <FundDialog operation="reversal" fund={fund} reversalId={row.id} /> : null}</td></tr>)}</tbody>
    </table></div>{!rows?.length ? <p className="py-8 text-sm text-[#66716b]">No transactions.</p> : null}
    <nav className="mt-4 flex gap-4 text-sm font-semibold">{page>0 ? <Link href={`/funds/${fund.id}?page=${page-1}`}>Previous</Link> : null}{rows?.length===100 ? <Link href={`/funds/${fund.id}?page=${page+1}`}>Next</Link> : null}</nav></section>
  </div>;
}
