"use client";

import { useState } from "react";
import { compareMoneyPools, moneySectionLabel, moneyWinnerRanking, type PublicMoneyResult } from "@/lib/events/public-money-results";

const currency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function PublicMoneyResults({ awards, contestantQuery }: { awards: PublicMoneyResult[]; contestantQuery: string }) {
  const [selected, setSelected] = useState("aggregate");
  const sections = [...new Map(awards.map((award) => [
    `${award.sectionType}:${award.roundNumber ?? 0}`,
    { key: `${award.sectionType}:${award.roundNumber ?? 0}`, type: award.sectionType, round: award.roundNumber },
  ])).values()].sort((a, b) => {
    const order = (type: string) => type === "aggregate" ? 2 : type === "short_round" ? 1 : 0;
    return order(a.type) - order(b.type) || (a.round ?? 0) - (b.round ?? 0);
  });
  const active = selected === "totals" ? "totals" : sections.some((section) => section.key === selected)
    ? selected : sections.find((section) => section.type === "aggregate")?.key ?? sections[0]?.key;
  const query = contestantQuery.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(query);
  const winners = moneyWinnerRanking(awards).filter((winner) => matches(winner.name));
  const stageAwards = awards.filter((award) => `${award.sectionType}:${award.roundNumber ?? 0}` === active);
  const pools = [...new Map(stageAwards.map((award) => [award.planId, award])).values()]
    .sort(compareMoneyPools);
  const sectionLabel = (section: (typeof sections)[number]) => section.type === "aggregate" ? "Average"
    : section.type === "short_round" ? "Short round" : section.type === "four_d" ? "4D results" : `Round ${section.round}`;

  if (!awards.length) return <p className="border-y border-[#dfe4e1] py-10 text-center text-sm text-[#66716b]">No money-winning results yet.</p>;
  return <section className="space-y-5">
    <label className="block w-fit max-w-full sm:hidden">
      <span className="sr-only">Money results section</span>
      <select value={active ?? ""} onChange={(event) => setSelected(event.target.value)} className="h-9 w-auto min-w-[160px] max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">
        {sections.map((section) => <option key={section.key} value={section.key}>{sectionLabel(section)}</option>)}
        <option value="totals">Total winnings</option>
      </select>
    </label>
    <div className="hidden flex-wrap gap-2 sm:flex" role="group" aria-label="Money results section">
      {sections.map((section) => <button type="button" key={section.key} aria-pressed={active === section.key} onClick={() => setSelected(section.key)} className={`min-h-10 border-b-2 px-3 text-sm font-semibold ${active === section.key ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[#66716b]"}`}>
        {sectionLabel(section)}
      </button>)}
      <button type="button" aria-pressed={active === "totals"} onClick={() => setSelected("totals")} className={`min-h-10 border-b-2 px-3 text-sm font-semibold ${active === "totals" ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[#66716b]"}`}>Total winnings</button>
    </div>
    {active === "totals" ? <div className="overflow-x-auto">
      <h3 className="mb-3 font-bold">Highest money winners</h3>
      <table className="w-full text-left text-sm"><thead className="bg-[#eef1ef] text-xs text-[#66716b]"><tr><th scope="col" className="p-3">Rank</th><th scope="col" className="p-3">Contestant</th><th scope="col" className="hidden p-3 text-right sm:table-cell">Main</th><th scope="col" className="hidden p-3 text-right sm:table-cell">Side pots</th><th scope="col" className="p-3 text-right">Total</th></tr></thead>
        <tbody className="divide-y divide-[#dfe4e1]">{winners.map((winner) => <tr key={winner.roperId}><td className="p-3">{winner.place}</td><td className="p-3 font-semibold">{winner.name}<span className="mt-1 block text-[11px] font-normal text-[#66716b] sm:hidden">Main {currency(winner.mainCents)}<br />Side pots {currency(winner.sideCents)}</span></td><td className="hidden p-3 text-right sm:table-cell">{currency(winner.mainCents)}</td><td className="hidden p-3 text-right sm:table-cell">{currency(winner.sideCents)}</td><td className="whitespace-nowrap p-3 text-right font-bold">{currency(winner.totalCents)}</td></tr>)}</tbody>
      </table>{!winners.length ? <p className="py-6 text-center text-sm text-[#66716b]">No matching money winners.</p> : null}
    </div> : pools.map((pool) => {
      const rows = stageAwards.filter((award) => award.planId === pool.planId && matches(award.name))
        .sort((a, b) => (a.dNumber ?? 0) - (b.dNumber ?? 0) || a.place - b.place || a.name.localeCompare(b.name));
      return <section key={pool.planId} className="border-t border-[#dfe4e1] pt-4">
        <h3 className="mb-3 font-bold">{pool.poolType === "main" ? "Main pot" : pool.poolName}</h3>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#eef1ef] text-xs text-[#66716b]"><tr><th className="p-3">Place</th><th className="p-3">Contestant</th><th className="p-3 text-right">Time</th><th className="p-3 text-right">Winnings</th></tr></thead>
          <tbody className="divide-y divide-[#dfe4e1]">{rows.map((award) => <tr key={`${award.dNumber ?? 0}:${award.entryId}`}><td className="p-3 whitespace-nowrap">{award.dNumber ? `${moneySectionLabel(award)} · ` : ""}{award.place}</td><td className="p-3 font-semibold">{award.name}</td><td className="p-3 text-right font-mono">{award.time.toFixed(2)}</td><td className="p-3 text-right font-bold">{currency(award.payoutCents)}</td></tr>)}</tbody>
        </table></div>{!rows.length ? <p className="py-6 text-center text-sm text-[#66716b]">No matching money winners in this pot.</p> : null}
      </section>;
    })}
  </section>;
}
