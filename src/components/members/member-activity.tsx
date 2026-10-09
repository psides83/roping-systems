import Link from "next/link";
import { ChevronDown, ExternalLink, History, LockKeyhole } from "lucide-react";
import { loadMemberActivity } from "@/lib/member-activity-data";
import { activityTypes, activityDate, memberActivityPage } from "@/lib/member-activity";

export async function MemberActivityTimeline({ memberId, query }: { memberId: string; query: { type?: string; season?: string; from?: string; to?: string; page?: string } }) {
  const data = await loadMemberActivity(memberId, query);
  if (!data) return <p className="text-sm text-[#66716b]">Activity is unavailable for this member.</p>;
  const result = memberActivityPage(data.items, data.seasons, data.timezone, query);
  const date = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${activityDate(value, data.timezone)}T12:00:00Z`));
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ tab: "activity", type: result.type, season: result.season, page: String(page) });
    if (result.from) params.set("from", result.from);
    if (result.to) params.set("to", result.to);
    return `/members/${memberId}?${params}`;
  };
  return <section className="space-y-5" aria-label="Member activity">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold"><History size={19} />Activity</h2><span className="text-sm text-[#66716b]">{result.total} records</span></div>
    <form className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value="activity" />
      <label className="grid max-w-full gap-1 text-sm font-semibold">Season<select name="season" defaultValue={result.season} className="h-10 w-44 max-w-full rounded-md border bg-white pl-3 pr-9"><option value="all">All seasons</option>{data.seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">Type<select name="type" defaultValue={result.type} className="h-10 rounded-md border bg-white pl-3 pr-9"><option value="all">All activity</option>{Object.entries(activityTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-semibold">From<input type="date" name="from" defaultValue={result.from} className="h-10 w-40 rounded-md border bg-white px-3" /></label>
      <label className="grid gap-1 text-sm font-semibold">Through<input type="date" name="to" defaultValue={result.to} className="h-10 w-40 rounded-md border bg-white px-3" /></label>
      <button className="h-10 rounded-md border bg-white px-3 text-sm font-semibold">Filter</button>
      <Link href={`/members/${memberId}?tab=activity`} className="inline-flex h-10 items-center px-1 text-sm font-semibold underline">Clear</Link>
    </form>
    {result.error && <p role="alert" className="text-sm text-red-700">{result.error}</p>}
    {!result.items.length && !result.error ? <div className="border-y py-10 text-sm text-[#66716b]">No activity matches these filters.</div> : null}
    <ol className="divide-y divide-[#dfe4e1]">{result.items.map((item, index) => <li key={item.id} className="py-4">
      {(index === 0 || date(item.occurredAt) !== date(result.items[index - 1].occurredAt)) && <h3 className="mb-3 text-sm font-bold text-[#66716b]">{date(item.occurredAt)}</h3>}
      <details className="group border-l-2 border-[#ccd4d0] pl-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#66716b]"><span>{activityTypes[item.type]}</span>{item.staffOnly && <span className="inline-flex items-center gap-1"><LockKeyhole size={12} />Staff only</span>}</div><p className="font-semibold">{item.title}</p><p className="mt-1 break-words text-sm leading-6 text-[#66716b]">{item.summary}</p></div><ChevronDown size={18} className="mt-1 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 space-y-2 text-sm leading-6"><ul className="space-y-1 text-[#66716b]">{item.details.map((detail, i) => <li key={i} className="break-words">{detail}</li>)}</ul><Link href={item.href} className="inline-flex items-center gap-2 font-semibold underline">View record<ExternalLink size={14} /></Link></div>
      </details>
    </li>)}</ol>
    <nav aria-label="Activity pages" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Page {result.page} of {result.pageCount}</span><div className="flex gap-4">{result.page > 1 && <Link href={pageHref(result.page - 1)} className="font-semibold underline">Previous</Link>}{result.page < result.pageCount && <Link href={pageHref(result.page + 1)} className="font-semibold underline">Next</Link>}</div></nav>
  </section>;
}
