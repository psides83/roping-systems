import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { FundDialog } from "./fund-dialog";
export async function FundAccounts({ producerId,canManage }: { producerId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data,error } = await supabase.rpc("producer_fund_balances", { target_producer_id: producerId });
  if (error) throw new Error(`Unable to load fund balances: ${error.message}`);
  return <section className="border-y border-[#dfe4e1] py-5"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Fund accounts</h2>{canManage ? <FundDialog operation="create" /> : null}</header>
    <div className="mt-3 divide-y divide-[#e7ebe8]">{(data ?? []).map((fund: { id: string; name: string; is_active: boolean; balance_cents: number }) => <Link key={fund.id} href={`/funds/${fund.id}`} className="flex items-center justify-between gap-3 py-4 hover:bg-[#f7f8f7]"><span className="font-semibold">{fund.name}{!fund.is_active ? <span className="ml-2 rounded bg-[#eef1ef] px-2 py-1 text-xs text-[#66716b]">Archived</span> : null}</span><span className={`font-mono font-bold ${Number(fund.balance_cents)<0 ? "text-red-700" : ""}`}>{formatCurrency(Number(fund.balance_cents))}</span></Link>)}</div>
    {!data?.length ? <p className="mt-4 text-sm text-[#66716b]">No fund accounts yet.</p> : null}
  </section>;
}
