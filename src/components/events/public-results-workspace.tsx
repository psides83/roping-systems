"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { PublicRopingResults } from "@/components/events/public-roping-results";
import { PublicFourDFullResults } from "@/components/events/public-four-d-full-results";
import type { PublicEvent, PublicFourDResult } from "@/lib/events/public-event-data";
import type { PublicResult, PublicRoundResult } from "@/lib/events/public-standings";
import { publicEventDate } from "@/lib/events/public-event-navigation";
import { PublicMoneyResults } from "@/components/events/public-money-results";
import type { PublicMoneyResult } from "@/lib/events/public-money-results";

export function PublicResultsWorkspace({ ropings, results, fourDResults, runs, moneyResults, shortRoundRopingIds, initialRopingId, eventSlug }: {
  ropings: PublicEvent["scheduledRopings"];
  results: PublicResult[];
  fourDResults: PublicFourDResult[];
  runs: PublicRoundResult[];
  moneyResults: PublicMoneyResult[];
  shortRoundRopingIds: string[];
  initialRopingId?: string;
  eventSlug: string;
}) {
  const options = [...ropings];
  // Include scored ropings even if their schedule listing is missing.
  for (const row of [...results, ...fourDResults]) {
    if (!options.some((option) => option.id === row.divisionId)) options.push({
      id: row.divisionId, name: row.divisionName, scheduledDate: "", startsAt: null,
      scheduleType: "fixed", followsRopingName: null, scheduleNote: null, arenaName: null,
      eventDayStatus: "scheduled", estimatedStartsAt: null, eventDayNote: null,
    });
  }
  const [selected, setSelected] = useState(initialRopingId ?? ropings.find((row) => row.eventDayStatus === "in_progress")?.id
    ?? results[0]?.divisionId ?? fourDResults[0]?.divisionId ?? options[0]?.id ?? "");
  const selectedId = options.some((row) => row.id === selected) ? selected : options[0]?.id;
  const roping = options.find((row) => row.id === selectedId);
  const standardRows = results.filter((row) => row.divisionId === selectedId);
  const fourDRows = fourDResults.filter((row) => row.divisionId === selectedId);
  const [contestantQuery, setContestantQuery] = useState("");
  const [view, setView] = useState("money");
  const awards = moneyResults.filter((row) => row.ropingId === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
      <label className="block w-fit max-w-full text-xs font-semibold">
        Roping
        <select aria-label="Roping" value={selectedId ?? ""} onChange={(event) => {
          setSelected(event.target.value);
          setContestantQuery("");
          const url = new URL(window.location.href);
          url.searchParams.set("event", eventSlug);
          url.searchParams.set("roping", event.target.value);
          window.history.replaceState(null, "", url);
        }} className="mt-1 block h-11 w-auto max-w-[280px] rounded-md border border-[#ccd4d0] bg-white px-3 text-sm sm:max-w-[420px]">
          {!options.length ? <option value="">No ropings scheduled</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{option.competitionFormat === "four_d" ? "4D · " : ""}{option.name}{option.scheduledDate ? ` · ${publicEventDate(option.scheduledDate)}` : ""}{option.arenaName ? ` · ${option.arenaName}` : ""}{option.eventDayStatus === "completed" ? " · Completed" : option.eventDayStatus === "in_progress" ? " · Live" : ""}</option>)}
        </select>
      </label>
      {standardRows.length || fourDRows.length || awards.length ? <label className="block max-w-full text-xs font-semibold">
        Contestant
        <div className="relative mt-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#758078]" />
          <input type="search" aria-label="Find a contestant" placeholder="Find a contestant" value={contestantQuery} onChange={(event) => setContestantQuery(event.target.value)} className="h-11 w-60 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-9 pr-3 text-sm" />
        </div>
      </label> : null}
      </div>
      <div className="inline-flex rounded-md border border-[#ccd4d0] p-1" role="group" aria-label="Results view">
        {[{ value: "money", label: "Money winners" }, { value: "full", label: "Full results" }].map((option) => <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)} className={`min-h-11 rounded px-3 text-sm font-semibold ${view === option.value ? "brand-primary-fill text-white" : "text-[#66716b]"}`}>{option.label}</button>)}
      </div>
      {view === "money" ? <PublicMoneyResults key={selectedId} awards={awards} contestantQuery={contestantQuery} />
        : fourDRows.length || roping?.competitionFormat === "four_d" ? <PublicFourDFullResults rows={fourDRows} results={standardRows} awards={awards} title={roping?.name ?? fourDRows[0]?.divisionName} contestantQuery={contestantQuery} />
        : standardRows.length ? <PublicRopingResults key={selectedId} title={roping?.name} results={standardRows} runs={runs.filter((run) => run.divisionId === selectedId)} awards={awards} shortRoundEnabled={shortRoundRopingIds.includes(selectedId ?? "")} contestantQuery={contestantQuery} />
        : <p className="border-y border-[#dfe4e1] py-10 text-center text-sm text-[#66716b]">{roping ? `No results have been recorded for ${roping.name} yet.` : "No roping results are available yet."}</p>}
    </div>
  );
}
