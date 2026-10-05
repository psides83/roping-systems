"use client";

import { useId, useState } from "react";
import { formatFinalTimeAdjustment } from "@/lib/scoring";
import { compareMoneyPools, type PublicMoneyResult } from "@/lib/events/public-money-results";
import {
  averageStandings, roundStandings,
  type PublicResult, type PublicRoundResult,
} from "@/lib/events/public-standings";

export function PublicRopingResults({ results, runs, awards = [], shortRoundEnabled = false, contestantQuery = "" }: {
  results: PublicResult[];
  runs: PublicRoundResult[];
  awards?: PublicMoneyResult[];
  shortRoundEnabled?: boolean;
  contestantQuery?: string;
}) {
  const [selected, setSelected] = useState("average");
  const id = useId();
  const roping = results[0];
  if (!roping) return null;
  const tabs = [
    ...Array.from({ length: roping.mainRoundCount }, (_, index) => ({
      value: String(index + 1), label: `Round ${index + 1}`,
    })),
    ...(shortRoundEnabled ? [{ value: String(roping.mainRoundCount + 1), label: "Short Round" }] : []),
    { value: "average", label: "Average" },
  ];
  const standings = selected === "average" ? averageStandings(results) : roundStandings(runs, Number(selected));
  const rows = standings.filter((row) => row.name.toLowerCase().includes(contestantQuery.toLowerCase().trim()));

  return (
    <div className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e7ebe8] px-4 py-4 sm:px-5">
        <h3 className="font-bold">{roping.divisionName}</h3>
        <span className="text-xs font-semibold text-[#758078]">
          {roping.resultStatus === "official" ? "Official" : "Unofficial"}
        </span>
      </div>
      <label className="block border-b border-[#e7ebe8] p-3 sm:hidden">
        <span className="sr-only">Results round</span>
        <select value={selected} onChange={(event) => setSelected(event.target.value)} className="h-9 w-auto min-w-[140px] max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">
          {tabs.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
        </select>
      </label>
      <div role="tablist" aria-label={`${roping.divisionName} results`} className="hidden overflow-x-auto border-b border-[#e7ebe8] sm:flex">
        {tabs.map((tab, index) => (
          <button key={tab.value} type="button" role="tab" id={`${id}-tab-${tab.value}`}
            aria-selected={selected === tab.value} aria-controls={`${id}-panel`}
            tabIndex={selected === tab.value ? 0 : -1}
            onClick={() => setSelected(tab.value)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              setSelected(tabs[next].value);
              document.getElementById(`${id}-tab-${tabs[next].value}`)?.focus();
            }}
            className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-4px] sm:px-5 ${selected === tab.value ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-transparent text-[#66716b] hover:bg-[#f0f2f1]"}`}
          >{tab.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className="overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[520px] text-left">
            <thead className="bg-[#f0f2f1] text-[10px] font-bold uppercase text-[#66716b] sm:text-[11px]">
              <tr>
                <th scope="col" className="w-14 px-3 py-3 sm:w-20 sm:px-5">Place</th>
                <th scope="col" className="px-2 py-3 sm:px-5">Contestant</th>
                <th scope="col" className="w-14 px-2 py-3 sm:w-auto sm:px-5">Entry</th>
                <th scope="col" className="w-20 px-3 py-3 text-right sm:w-auto sm:px-5">{selected === "average" ? "Aggregate" : "Time"}</th>
                <th scope="col" className="w-24 px-2 py-3 text-right sm:w-auto">Winnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ebe8]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-4 sm:px-5"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${row.place === 1 ? "bg-[#e0a458] text-[#38220c]" : "bg-[#eef1ef] text-[#526058]"}`}>{row.place ?? "-"}</span></td>
                  <td className="break-words px-2 py-4 text-sm font-semibold leading-5 sm:px-5">
                    {row.name}
                    {row.adjustment ? <span className="mt-1 block text-[10px] font-bold text-emerald-700">{formatFinalTimeAdjustment(row.adjustment)} sec handicap</span> : null}
                    {row.progress ? <span className="mt-1 block text-[10px] font-semibold text-[#758078]">{row.progress}</span> : null}
                  </td>
                  <td className="px-2 py-4 text-sm text-[#66716b] sm:px-5">#{row.entryNumber}</td>
                  <td className="px-3 py-4 text-right font-mono text-sm font-bold sm:px-5 sm:text-base">{row.time !== null ? row.time.toFixed(2) : row.status === "no_time" ? "NT" : row.status === "scratch" || row.status === "turned_out" ? "TO" : row.status === "rerun" ? "Rerun" : "-"}</td>
                  <td className="px-2 py-4 text-right text-xs">
                    {awards.filter((award) => award.entryId === row.entryId && (selected === "average" ? award.sectionType === "aggregate" : award.roundNumber === Number(selected))).sort(compareMoneyPools).map((award) => <span className="mb-1 block" key={award.planId}>
                      <strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(award.payoutCents / 100)}</strong><span className="block text-[10px] text-[#66716b]">{award.poolType === "main" ? "Main" : award.poolName}</span>
                    </span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="px-5 py-8 text-center text-sm text-[#66716b]">{contestantQuery ? "No matching contestants in these results." : "No results recorded for this round yet."}</p>}
      </div>
    </div>
  );
}
