"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { PublicRopingResults } from "@/components/events/public-roping-results";
import { FourDStandings } from "@/components/events/four-d-standings";
import type { PublicEvent, PublicFourDResult } from "@/lib/events/public-event-data";
import type { PublicResult, PublicRoundResult } from "@/lib/events/public-standings";
import { publicEventDate } from "@/lib/events/public-event-navigation";

export function PublicResultsWorkspace({ ropings, results, fourDResults, runs, shortRoundRopingIds, initialRopingId, eventSlug }: {
  ropings: PublicEvent["scheduledRopings"];
  results: PublicResult[];
  fourDResults: PublicFourDResult[];
  runs: PublicRoundResult[];
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

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold">
        Roping
        <select value={selectedId ?? ""} onChange={(event) => {
          setSelected(event.target.value);
          setContestantQuery("");
          const url = new URL(window.location.href);
          url.searchParams.set("event", eventSlug);
          url.searchParams.set("roping", event.target.value);
          window.history.replaceState(null, "", url);
        }} className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
          {!options.length ? <option value="">No ropings scheduled</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{option.name}{option.scheduledDate ? ` · ${publicEventDate(option.scheduledDate)}` : ""}{option.arenaName ? ` · ${option.arenaName}` : ""}{option.eventDayStatus === "completed" ? " · Completed" : option.eventDayStatus === "in_progress" ? " · Live" : ""}</option>)}
        </select>
      </label>
      {standardRows.length || fourDRows.length ? <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#758078]" />
        <input type="search" aria-label="Find a contestant" placeholder="Find a contestant" value={contestantQuery} onChange={(event) => setContestantQuery(event.target.value)} className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white pl-9 pr-3 text-sm" />
      </div> : null}
      {fourDRows.length || roping?.competitionFormat === "four_d" ? <FourDStandings rows={fourDRows} resultStatus={fourDRows[0]?.resultStatus ?? standardRows[0]?.resultStatus ?? "unofficial"} title={roping?.name ?? fourDRows[0]?.divisionName} contestantQuery={contestantQuery} />
        : standardRows.length ? <PublicRopingResults key={selectedId} results={standardRows} runs={runs.filter((run) => run.divisionId === selectedId)} shortRoundEnabled={shortRoundRopingIds.includes(selectedId ?? "")} contestantQuery={contestantQuery} />
        : <p className="border-y border-[#dfe4e1] py-10 text-center text-sm text-[#66716b]">{roping ? `No results have been recorded for ${roping.name} yet.` : "No roping results are available yet."}</p>}
    </div>
  );
}
