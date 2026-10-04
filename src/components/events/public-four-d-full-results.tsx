import { FourDStandings } from "@/components/events/four-d-standings";
import type { PublicFourDResult } from "@/lib/events/public-event-data";
import type { PublicResult } from "@/lib/events/public-standings";
import type { PublicMoneyResult } from "@/lib/events/public-money-results";
import { runStatusAbbreviations, type RunStatus } from "@/lib/run-status";

export function PublicFourDFullResults({ rows, results, awards, title, contestantQuery }: {
  rows: PublicFourDResult[];
  results: PublicResult[];
  awards: PublicMoneyResult[];
  title?: string;
  contestantQuery: string;
}) {
  const rankedIds = new Set(rows.map((row) => row.entryId));
  const others = results.filter((row) => !rankedIds.has(row.resultId)
    && row.name.toLowerCase().includes(contestantQuery.trim().toLowerCase()));
  return <div className="space-y-4">
    <FourDStandings rows={rows} awards={awards} resultStatus={rows[0]?.resultStatus ?? results[0]?.resultStatus ?? "unofficial"} title={title} contestantQuery={contestantQuery} />
    {others.length ? <section className="border-t border-[#dfe4e1] pt-4">
      <h3 className="mb-3 text-sm font-bold">Other entries</h3>
      <ul className="divide-y divide-[#dfe4e1]">{others.map((row) => <li key={row.resultId} className="flex items-center justify-between gap-3 py-3 text-sm">
        <span className="font-semibold">{row.name}<span className="ml-2 font-normal text-[#66716b]">#{row.entryNumber}</span></span>
        <span className="shrink-0 font-mono">{row.totalTime?.toFixed(2) ?? runStatusAbbreviations[row.status as RunStatus] ?? "-"}</span>
      </li>)}</ul>
    </section> : null}
  </div>;
}
