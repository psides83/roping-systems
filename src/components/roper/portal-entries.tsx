import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { formatEntryLabel } from "@/lib/entry-labels";
import { portalResultsLink, type PortalEntry, type PortalMembership } from "@/lib/roper-portal";

export function PortalEntries({ entries, membership, history = false }: { entries: PortalEntry[]; membership: PortalMembership; history?: boolean }) {
  if (!entries.length) return <p className="py-8 text-sm text-[#66716b]">{history ? "No past entries yet." : "No upcoming entries."}</p>;
  return <div className="divide-y divide-[#dfe4e1]">{entries.map((entry) => {
    const href = portalResultsLink(membership, entry);
    const title = entry.division && !entry.ropingName.toLowerCase().includes(entry.division.toLowerCase()) ? `${entry.ropingName} · ${entry.division}` : entry.ropingName;
    const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${entry.date}T12:00:00Z`));
    return <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0"><p className="text-xs text-[#66716b]">{date} · {entry.eventTitle}</p><h3 className="mt-1 break-words font-semibold">{title}</h3><p className="mt-1 text-sm text-[#66716b]">Entry {membership.entryLabelStyle === "number" ? "#" : ""}{formatEntryLabel(entry.number, membership.entryLabelStyle)}</p></div>
      <div className="flex flex-wrap items-center gap-2"><StatusPill status={entry.competitionStatus !== "active" ? entry.competitionStatus : entry.status} /><StatusPill status={entry.paymentStatus} />{href ? <Link href={href} className="inline-flex h-9 items-center gap-1 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">Results<ArrowUpRight size={15} /></Link> : null}</div>
    </article>;
  })}</div>;
}
