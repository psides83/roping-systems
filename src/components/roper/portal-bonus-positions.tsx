import Link from "next/link";
import { Clock3, Ticket, ChevronDown } from "lucide-react";
import { roperBonusPositions, type RoperBonusSource } from "@/lib/roper-bonus-positions";

const labels = { pending: "Pending assignment", assigned: "Assigned", expired: "Expired", needs_review: "Staff review needed" };
const colors = { pending: "bg-amber-50 text-amber-800", assigned: "bg-emerald-50 text-emerald-800", expired: "bg-stone-100 text-stone-600", needs_review: "bg-rose-50 text-rose-800" };
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export function PortalBonusPositions({ data, producerSlug }: { data: RoperBonusSource; producerSlug: string }) {
  const slots = roperBonusPositions(data);
  const counts = { pending: 0, assigned: 0, expired: 0, needs_review: 0 };
  for (const slot of slots) counts[slot.status]++;
  return <section className="space-y-5" aria-label="Earned bonus positions">
    <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Ticket size={18} />Earned bonus positions</h2>
      {data.seasons.length ? <form action="/roper" className="flex flex-wrap items-end gap-2"><input type="hidden" name="producer" value={producerSlug} /><input type="hidden" name="view" value="bonus" /><label className="flex flex-col gap-1 text-xs font-semibold">Season<select name="season" defaultValue={data.season?.id} className="h-9 w-52 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">{data.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button className="h-9 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">View</button></form> : null}
    </div>
    {data.season ? <p className="flex flex-wrap items-center gap-2 text-sm text-[#66716b]"><Clock3 size={15} />Pending positions expire {date(data.season.endsOn)}.</p> : null}
    {slots.length ? <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => <p key={status}><strong>{count}</strong> {labels[status as keyof typeof labels].toLowerCase()}</p>)}</div> : <p className="py-5 text-sm text-[#66716b]">{data.season ? "No earned bonus positions in this season." : "This producer has not set up a season yet."}</p>}
    <div className="divide-y divide-[#dfe4e1]">{slots.map((slot) => <details key={`${slot.awardId}:${slot.number}`} className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><h3 className="break-words font-semibold">{slot.className}</h3><p className="mt-1 text-xs text-[#66716b]">Bonus position {slot.number}{slot.sourceRoping ? ` · Earned at ${slot.sourceRoping.eventTitle}` : slot.source === "manual" ? " · Awarded by staff" : " · Qualifier award"}</p></div><span className="flex items-center gap-2"><span className={`rounded px-2 py-1 text-xs font-semibold ${colors[slot.status]}`}>{labels[slot.status]}</span><ChevronDown size={18} className="transition-transform group-open:rotate-180" /></span></summary>
      <div className="space-y-3 pb-5 text-sm">
        {slot.targetRoping ? <div><p className="text-xs text-[#66716b]">{slot.status === "needs_review" ? "Previous assignment" : "Assigned roping"}</p><p className="mt-1 break-words font-semibold">{slot.targetRoping.eventTitle} · {slot.targetRoping.name}</p><p className="mt-1 text-[#66716b]">{date(slot.targetRoping.date)}</p>{slot.status === "assigned" && slot.targetRoping.public ? <Link className="mt-2 inline-block font-semibold underline" href={`/public/${encodeURIComponent(producerSlug)}/${encodeURIComponent(slot.targetRoping.eventSlug)}/enter`}>View event entries</Link> : null}</div> : null}
        <p className="text-[#66716b]">{slot.status === "pending" ? "Your producer will assign this extra entry to a roping. It is not a confirmed entry yet." : slot.status === "expired" ? "This position expired without being assigned to a roping." : slot.status === "needs_review" ? "Your classification changed. The producer must review this assignment before it can be used." : "This adds one extra entry to your normal allowance at the assigned roping. Entry fees and the producer's eligibility rules still apply."}</p>
      </div>
    </details>)}</div>
  </section>;
}
