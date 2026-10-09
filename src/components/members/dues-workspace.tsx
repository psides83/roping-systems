"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { DuesDialog } from "./dues-dialog";
import { duesTotals, type DuesAccount, type DuesSettings } from "@/lib/membership-dues";
import { formatCurrencyExact as formatCurrency } from "@/lib/utils";

type Choice = { id: string; name: string; is_active?: boolean };
export function DuesWorkspace({ accounts, members, seasons, funds, settings, canManage, season, member, timezone }: { accounts: DuesAccount[]; members: Choice[]; seasons: Choice[]; funds: Choice[]; settings: DuesSettings | null; canManage: boolean; season?: string; member?: string; timezone: string }) {
  const [query, setQuery] = useState(members.find((item) => item.id === member)?.name ?? "");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const names = new Map(members.map((item) => [item.id, item.name]));
  const seasonNames = new Map(seasons.map((item) => [item.id, item.name]));
  const fundNames = new Map(funds.map((item) => [item.id, item.name]));
  const filtered = accounts.filter((account) => {
    const totals = duesTotals([account]);
    return (names.get(account.membership_id) ?? "").toLowerCase().includes(query.toLowerCase()) && (status === "all" || (status === "paid" ? totals.outstanding === 0 : totals.outstanding > 0));
  });
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 20) - 1));
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><input aria-label="Search dues" type="search" placeholder="Find member" className="h-10 w-60 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /><select aria-label="Dues status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className="h-10 rounded-md border border-[#ccd4d0] bg-white pl-3 pr-9 text-sm"><option value="all">All dues</option><option value="outstanding">Outstanding</option><option value="paid">Paid</option></select>{canManage && settings && <DuesDialog operation="assess" settings={settings} members={members} seasons={seasons} funds={funds} season={season} member={member} />}</div>
    <div className="divide-y divide-[#d7ddda]">{filtered.slice(current * 20, current * 20 + 20).map((account) => {
      const total = duesTotals([account]);
      const reversed = new Set(account.payments.map((payment) => payment.reverses_id));
      return <details key={account.id} className="group py-4"><summary className="flex cursor-pointer list-none flex-wrap items-center gap-3"><ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" /><div className="min-w-0 flex-1"><span className="break-words font-semibold">{names.get(account.membership_id)}</span><span className="mt-1 block text-xs text-[#66716b]">{seasonNames.get(account.season_id)} · {total.outstanding === 0 ? "Paid" : total.collected > 0 ? "Partially paid" : "Unpaid"}</span></div><span className="text-right text-sm font-semibold">{formatCurrency(total.collected)} / {formatCurrency(total.charged)}<span className="mt-1 block text-xs font-normal text-[#66716b]">{formatCurrency(total.outstanding)} outstanding</span></span></summary>
        <div className="mt-4 space-y-4 pl-7"><div className="flex flex-wrap items-center gap-3"><Link href={`/members/${account.membership_id}`} className="text-sm font-semibold hover:underline">Member record</Link>{canManage && total.outstanding > 0 && <DuesDialog operation="payment" account={account} />}{account.fund_id && <Link href={`/funds/${account.fund_id}`} className="text-sm text-[var(--brand-accent-strong)] hover:underline">{fundNames.get(account.fund_id) ?? "Contribution fund"} · {formatCurrency(total.contributed)} contributed</Link>}</div>
          {account.payments.length ? <ul className="divide-y divide-[#dfe4e1]">{account.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-semibold">{formatCurrency(Number(payment.amount_cents))} · {payment.method}{reversed.has(payment.id) ? " · Reversed" : ""}</p><p className="mt-1 break-words text-sm text-[#66716b]">{payment.reason}</p><p className="mt-1 text-xs text-[#66716b]">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: timezone }).format(new Date(payment.created_at))} · {payment.staff_label}</p><p className="mt-1 text-xs text-[#66716b]">Fund contribution: {formatCurrency(Number(payment.contributed_cents))}</p></div>{canManage && Number(payment.amount_cents) > 0 && !reversed.has(payment.id) && <DuesDialog operation="reversal" account={account} reversalId={payment.id} />}</li>)}</ul> : <p className="text-sm text-[#66716b]">No payments recorded.</p>}
        </div>
      </details>;
    })}</div>
    {!filtered.length && <p className="py-8 text-sm text-[#66716b]">No seasonal dues match this view.</p>}
    {filtered.length > 20 && <nav aria-label="Dues pages" className="flex items-center gap-3 text-sm"><button disabled={current === 0} onClick={() => setPage(current - 1)} className="h-10 rounded-md border bg-white px-3 disabled:opacity-40">Previous</button><span>Page {current + 1} of {Math.ceil(filtered.length / 20)}</span><button disabled={(current + 1) * 20 >= filtered.length} onClick={() => setPage(current + 1)} className="h-10 rounded-md border bg-white px-3 disabled:opacity-40">Next</button></nav>}
  </div>;
}
