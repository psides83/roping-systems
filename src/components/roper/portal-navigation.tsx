import Link from "next/link";
import { NavigationPending } from "@/components/ui/navigation-pending";

export function PortalNavigation({ producerSlug, view, upcoming, pending }: { producerSlug: string; view: string; upcoming: number; pending: number }) {
  const sections = [["entries", `Upcoming (${upcoming})`], ["results", "Results & winnings"], ["history", "Entry history"], ["requests", `Online requests${pending ? ` (${pending} pending)` : ""}`], ["balances", "Balances"], ["standings", "My standings"], ["bonus", "Bonus positions"], ["membership", "Membership"]];
  return <nav aria-label="Portal sections" className="border-b border-[#dfe4e1]">
    <form action="/roper" className="mb-3 flex flex-wrap items-end gap-2 sm:hidden"><input type="hidden" name="producer" value={producerSlug} /><label className="flex flex-col gap-1 text-xs font-semibold">Section<select name="view" defaultValue={view} className="h-9 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">{sections.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="h-9 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">View</button></form>
    <div className="hidden flex-wrap gap-x-4 gap-y-2 sm:flex">{sections.map(([key, label]) => <Link key={key} aria-current={view === key ? "page" : undefined} href={`/roper?${new URLSearchParams({ producer: producerSlug, view: key })}`} className={`inline-flex items-center gap-1 border-b-2 pb-3 text-sm font-semibold ${view === key ? "border-[#384fa8] text-[#384fa8]" : "border-transparent text-[#66716b]"}`}>{label}<NavigationPending label="Loading your portal" /></Link>)}</div>
  </nav>;
}
