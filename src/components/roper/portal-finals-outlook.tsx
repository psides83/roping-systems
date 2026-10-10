import Link from "next/link";
import { Flag } from "lucide-react";
import { outlookStatusLabels } from "@/lib/finals-outlook";
import type { loadRoperFinalsOutlook } from "@/lib/events/finals-outlook-data";

function dateLabel(date: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)); }
export function PortalFinalsOutlook({ data }: { data: Awaited<ReturnType<typeof loadRoperFinalsOutlook>> }) {
  const { context, rows } = data;
  return <section aria-label="Qualification outlook" className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Flag size={18}/>Qualification outlook</h2>
      {context.seasons.length > 0 && <form action="/roper" className="flex flex-wrap items-end gap-2"><input type="hidden" name="producer" value={context.producerSlug}/><input type="hidden" name="view" value="outlook"/><label className="grid gap-1 text-xs font-semibold">Season<select name="season" defaultValue={context.season?.id} className="h-9 w-48 max-w-full rounded-md border bg-white pl-3 pr-9 text-sm">{context.seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button className="h-9 rounded-md border px-3 text-sm font-semibold">View</button></form>}
    </header>
    <p className="text-sm text-[#66716b]">Projected as of {dateLabel(context.today)} using official results. This is not an approved entry or an awarded position. Standings can change until the cutoff; entry checks and producer decisions still apply.</p>
    {!rows.length && <p className="border-y py-6 text-sm text-[#66716b]">{context.season ? "No upcoming qualification-required ropings are published for you in this season." : "This producer has not set up a season yet."}</p>}
    <div className="divide-y border-y border-[#dfe4e1]">{rows.map(({ target, progress }) => <article key={target.id} className="space-y-4 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-[#66716b]">{target.eventTitle} · {dateLabel(target.date)}</p><h3 className="mt-1 font-semibold">{target.name}</h3></div><span className={`text-sm font-semibold ${progress.status === "qualifies" ? "text-emerald-700" : progress.status === "review" ? "text-amber-800" : "text-[#66716b]"}`}>{outlookStatusLabels[progress.status]}</span></header>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {target.rule.topPlaces !== null && <div><dt className="text-xs text-[#66716b]">Standings position</dt><dd className="mt-1 font-semibold">{progress.rank === null ? "Not ranked" : `#${progress.rank}`} · Top {target.rule.topPlaces} qualify</dd></div>}
        {target.rule.minimumRopings > 0 && <div><dt className="text-xs text-[#66716b]">Qualifying attendance</dt><dd className="mt-1 font-semibold">{progress.attendance} of {target.rule.minimumRopings} ropings</dd></div>}
        <div><dt className="text-xs text-[#66716b]">Assigned bonus positions</dt><dd className="mt-1 font-semibold">{progress.assigned}</dd></div>
        <div><dt className="text-xs text-[#66716b]">Entry allowance if eligible</dt><dd className="mt-1 font-semibold">{progress.allowance === null ? "Unlimited" : `${progress.allowance} ${progress.allowance === 1 ? "entry" : "entries"}`}{progress.bonusEntries > 0 && <span className="mt-1 block text-xs font-normal">{target.normalEntries} regular + {progress.bonusEntries} bonus</span>}</dd></div>
      </dl>
      {target.rule.requirementMatch === "any" && target.rule.minimumRopings > 0 && target.rule.topPlaces !== null && <p className="text-xs text-[#66716b]">Meet either the standings requirement or the attendance requirement.</p>}
      {progress.reasons.length > 0 && <ul className="space-y-1 text-sm text-[#66716b]">{progress.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      {progress.assigned > 0 && target.rule.earnedPositionPolicy !== "none" && <p className="text-xs text-[#66716b]">Assigned bonus positions {target.rule.earnedPositionPolicy === "rank_and_attendance" ? "waive standings and attendance requirements" : "waive standings requirements; attendance is still required"}.</p>}
      {!target.bonusEnabled && progress.assigned > 0 && <p className="text-xs text-[#66716b]">Extra entries are not enabled for this roping. Ask the producer about your assigned positions.</p>}
      {progress.pendingPositions > 0 && <p className="text-xs text-amber-800">{progress.pendingPositions} pending {progress.pendingPositions === 1 ? "position needs" : "positions need"} producer assignment. Not included in this roping&apos;s entry allowance.</p>}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#66716b]">{target.rule.topPlaces !== null && progress.standingsDeadline && <p>Standings through <strong>{dateLabel(progress.standingsDeadline.date)}</strong> · {progress.standingsDeadline.label}</p>}{target.rule.minimumRopings > 0 && progress.attendanceDeadline && <p>Attendance through <strong>{dateLabel(progress.attendanceDeadline.date)}</strong> · {progress.attendanceDeadline.label}</p>}</div>
      <p className="text-xs text-[#66716b]">Cutoff dates include that day. Entry fees still apply.</p>
      <Link href={`/public/${encodeURIComponent(context.producerSlug)}/schedule?${new URLSearchParams({ event: target.eventSlug })}`} className="inline-block text-sm font-semibold underline">View event schedule</Link>
    </article>)}</div>
  </section>;
}
