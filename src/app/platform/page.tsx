import Link from "next/link";
import { Plus, Search, ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { platformAdminClient } from "@/lib/platform-admin-data";
import { accountStatuses, directoryFilters, type PlatformDirectory } from "@/lib/platform-admin";
import { AccountStatusBadge } from "@/components/platform/status-badge";

export default async function PlatformPage({ searchParams }: PageProps<"/platform">) {
  const filters = directoryFilters(await searchParams);
  const db = await platformAdminClient();
  const { data, error } = await db.rpc("platform_producer_directory", { search_text: filters.q, status_filter: filters.status, page_number: filters.page });
  if (error) throw new Error("Unable to load producer accounts.");
  const directory = data as PlatformDirectory;
  const pageLink = (page: number) => `/platform?${new URLSearchParams({ q: filters.q, status: filters.status, page: String(page) })}`;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Producer accounts</h1><p className="mt-1 text-sm text-[#66716b]">Accounts, contacts, and onboarding</p></div><Link href="/platform/producers/new" className="flex h-10 items-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white"><Plus size={17} />Create producer</Link></header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{(["pending", "setup", "active", "suspended"] as const).map((status) => <Link key={status} href={`/platform?status=${status}`} className="rounded-md border border-[#dfe4e1] bg-white p-4 hover:border-[#3146a8]"><p className="text-sm font-semibold text-[#66716b]">{accountStatuses[status]}</p><p className="mt-2 text-2xl font-bold">{directory.counts?.[status] ?? 0}</p></Link>)}</div>
    <form className="flex flex-wrap items-end gap-3" action="/platform">
      <label className="text-xs font-semibold text-[#66716b]">Search<input type="search" name="q" defaultValue={filters.q} placeholder="Producer, contact, or email" className="mt-1 block h-10 w-72 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-[#66716b]">Account status<select name="status" defaultValue={filters.status} className="mt-1 block h-10 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"><option value="">All accounts</option>{Object.entries(accountStatuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><Search size={16} />Search</button>
      {(filters.q || filters.status) && <Link href="/platform" className="py-2 text-sm font-semibold underline">Clear</Link>}
    </form>
    <div className="border-y border-[#dfe4e1] bg-white">
      <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_minmax(0,1fr)] gap-4 border-b border-[#dfe4e1] px-4 py-3 text-xs font-semibold uppercase text-[#66716b] md:grid"><span>Producer</span><span>Primary contact</span><span>Status</span><span>Next action</span></div>
      {directory.rows.map((row) => <Link key={row.id} href={`/platform/producers/${row.id}`} className="grid gap-3 border-b border-[#e7ebe8] px-4 py-5 last:border-0 hover:bg-[#f7f8fa] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_minmax(0,1fr)] md:items-center">
        <div className="min-w-0"><h2 className="flex items-center gap-2 font-bold">{row.name}<ArrowUpRight size={15} className="shrink-0 text-[#758078]" /></h2><p className="mt-1 break-all text-xs text-[#758078]">/public/{row.slug}</p></div>
        <div className="min-w-0 text-sm"><p>{row.contact_name ?? "No primary contact"}</p><p className="mt-1 break-all text-xs text-[#66716b]">{row.contact_email ?? ""}</p></div>
        <div><AccountStatusBadge status={row.status} />{row.status === "setup" && <p className="mt-1 text-xs text-[#66716b]">{row.completed_tasks} of 7 reviewed</p>}</div>
        <div className="text-sm"><p className="break-words">{row.next_action || "No follow-up set"}</p>{row.follow_up_on && <p className="mt-1 text-xs text-[#66716b]">Follow up {row.follow_up_on}</p>}</div>
      </Link>)}
      {!directory.rows.length && <p className="px-4 py-10 text-center text-sm text-[#66716b]">No producer accounts match these filters.</p>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#66716b]"><span>{directory.total} accounts · Page {filters.page}</span><div className="flex gap-4">{filters.page>1 && <Link href={pageLink(filters.page-1)} className="flex items-center gap-1 font-semibold"><ChevronLeft size={16} />Previous</Link>}{filters.page*25<directory.total && <Link href={pageLink(filters.page+1)} className="flex items-center gap-1 font-semibold">Next<ChevronRight size={16} /></Link>}</div></footer>
  </div>;
}
