import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatAccountMoney } from "@/lib/roper-accounts";
import type { PortalStanding, RoperStandingsContext } from "@/lib/roper-standings";

export function PortalStandings({ context, rows }: { context: RoperStandingsContext; rows: PortalStanding[] }) {
  return <section aria-label="Personal standings" className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Trophy size={18} />My standings</h2>
      {context.seasons.length ? <form action="/roper" className="flex flex-wrap items-end gap-2"><input type="hidden" name="producer" value={context.producerSlug} /><input type="hidden" name="view" value="standings" /><label className="flex flex-col gap-1 text-xs font-semibold">Season<select name="season" defaultValue={context.season?.id} className="h-9 w-52 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">{context.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button className="h-9 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">View</button></form> : null}
    </header>
    <p className="text-sm text-[#66716b]">Official public results. Roping counts follow each roping&apos;s attendance settings.</p>
    {!rows.length ? <p className="py-6 text-sm text-[#66716b]">{context.season ? "No standings or current classifications to display for this season." : "This producer has not set up a season yet."}</p> : null}
    <div className="divide-y divide-[#dfe4e1]">{rows.map((row) => <article key={row.classId} className="space-y-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{row.name}</h3><Link className="text-sm font-semibold underline" href={`/public/${encodeURIComponent(context.producerSlug)}/standings?${new URLSearchParams({ season: context.season!.id, class: row.classId })}`}>Class standings</Link></header>
      {row.handicap ? <p className="text-xs text-[#66716b]">{row.handicap} · {Number(row.handicapSeconds) > 0 ? "+" : ""}{Number(row.handicapSeconds).toFixed(2)} sec handicap</p> : null}
      <dl className="flex flex-wrap gap-x-8 gap-y-3"><div><dt className="text-xs text-[#66716b]">Rank</dt><dd className="text-lg font-semibold tabular-nums">{row.rank ?? "-"}</dd></div><div><dt className="text-xs text-[#66716b]">Standings earnings</dt><dd className="text-lg font-semibold tabular-nums">{formatAccountMoney(row.winningsCents)}</dd></div><div><dt className="text-xs text-[#66716b]">Roping count</dt><dd className="text-lg font-semibold tabular-nums">{row.ropingsEntered}</dd></div></dl>
      {row.hasCarryover ? <p className="text-xs text-[#66716b]">Standings earnings include classification-move adjustments.</p> : null}
      {row.requirement ? <div className="space-y-2 text-sm"><p className={`font-semibold ${row.meetsRequirements ? "text-emerald-700" : "text-[#66716b]"}`}>{row.meetsRequirements ? "Meets standings requirements" : "Below standings requirements"}</p><p className="text-[#66716b]">{row.requirement.topPlaces ? `Top ${row.requirement.topPlaces} · ` : ""}{row.qualifyingCount} of {row.requirement.minimumRopings} required ropings{row.remainingRopings ? ` · ${row.remainingRopings} more needed` : ""}</p><p className="text-xs text-[#66716b]">Standings through {row.requirement.cutoffOn ?? context.season?.endsOn} · Rank at cutoff: {row.qualifyingRank ?? "Not ranked"}</p><p className="text-xs text-[#66716b]">Attendance through {row.requirement.attendanceCutoffOn ?? context.season?.endsOn}</p></div> : <p className="text-xs text-[#66716b]">No standings-based finals requirements configured for this class.</p>}
    </article>)}</div>
    {rows.some((row) => row.requirement) ? <p className="border-t border-[#dfe4e1] pt-4 text-xs text-[#66716b]">Assigned bonus positions and other entry restrictions are checked separately for each roping.</p> : null}
  </section>;
}
