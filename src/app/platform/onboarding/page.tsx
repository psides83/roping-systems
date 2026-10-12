import Link from "next/link";
import { ArrowRight, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { platformAdminClient } from "@/lib/platform-admin-data";
import { onboardingTasks, type PlatformDirectory } from "@/lib/platform-admin";
import { onboardingViews, onboardingWorkspaceFilters, onboardingNextAction } from "@/lib/platform-onboarding-workspace";
import { AccountStatusBadge } from "@/components/platform/status-badge";

export default async function OnboardingWorkspace({ searchParams }: PageProps<"/platform/onboarding">) {
  const filters = onboardingWorkspaceFilters(await searchParams);
  const db = await platformAdminClient();
  const { data, error } = await db.rpc("platform_producer_directory", { search_text: filters.q, status_filter: filters.view === "all" ? "" : filters.view, page_number: filters.page });
  if (error) throw new Error("Unable to load producer onboarding.");
  const directory = data as PlatformDirectory;
  const totalSteps = Object.keys(onboardingTasks).length;
  const pageLink = (page: number) => `/platform/onboarding?${new URLSearchParams({ view: filters.view, q: filters.q, page: String(page) })}`;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Producer onboarding</h1><p className="mt-1 text-sm text-[#66716b]">Contacts, approval, setup, migration, staff access, and launch.</p></div><Link href="/platform/producers/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white"><Plus size={17} />Add producer</Link></header>
    <div className="grid gap-3 sm:grid-cols-3">{(["pending", "setup", "active"] as const).map(view => <Link key={view} href={`/platform/onboarding?view=${view}`} className={`rounded-md border bg-white p-4 ${filters.view === view ? "border-[#3146a8]" : "border-[#dfe4e1]"}`}><p className="text-sm font-semibold text-[#66716b]">{onboardingViews[view]}</p><p className="mt-2 text-2xl font-bold">{directory.counts?.[view] ?? 0}</p></Link>)}</div>
    <form action="/platform/onboarding" className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Find producer<input name="q" type="search" defaultValue={filters.q} placeholder="Producer, contact, or email" className="mt-1 block h-10 w-64 max-w-full rounded-md border bg-white px-3 text-sm" /></label><label className="text-xs font-semibold">Show<select name="view" defaultValue={filters.view} className="mt-1 block h-10 rounded-md border bg-white px-3 text-sm">{Object.entries(onboardingViews).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold"><Search size={16} />Apply</button>{filters.q && <Link href={`/platform/onboarding?view=${filters.view}`} className="py-2 text-sm underline">Clear search</Link>}</form>
    <section className="divide-y divide-[#dfe4e1] border-y border-[#dfe4e1] bg-white">
      {directory.rows.map(row => { const next = onboardingNextAction(row); const base = `/platform/producers/${row.id}`; return <article key={row.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0"><Link href={`${base}?tab=onboarding`} className="break-words font-bold hover:underline">{row.name}</Link><div className="mt-2"><AccountStatusBadge status={row.status} /></div><p className="mt-3 text-sm">{row.contact_name || "Primary contact not recorded"}</p>{row.contact_email && <p className="mt-1 break-all text-xs text-[#66716b]">{row.contact_email}</p>}</div>
        <div className="space-y-2"><p className="text-sm font-semibold">{row.completed_tasks} of {totalSteps} setup reviews complete</p><progress value={row.completed_tasks} max={totalSteps} aria-label={`${row.name} setup reviews`} className="block h-2 w-full accent-[#3146a8]" /><p className="text-xs leading-5 text-[#66716b]">{row.completed_tasks >= totalSteps ? "Setup reviewed. Activation remains a separate decision." : "Review formats, payout schedules, seasons, imports, staff access, and public pages."}</p><div className="flex flex-wrap gap-4 text-xs font-semibold"><Link href={`${base}?tab=contacts`} className="underline">Contacts & invitations</Link><Link href={`${base}?tab=notes`} className="underline">Notes & history</Link></div></div>
        <div className="space-y-3"><p className="break-words text-sm"><strong>Next follow-up: </strong>{row.next_action || "Not set"}</p>{row.follow_up_on && <p className="text-xs text-[#66716b]">Follow up {row.follow_up_on}</p>}<Link href={`${base}?tab=${next.tab}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold">{next.label}<ArrowRight size={15} /></Link><Link href={`${base}?tab=account`} className="block text-xs underline">Update follow-up</Link></div>
      </article>; })}
      {!directory.rows.length && <p className="p-8 text-center text-sm text-[#66716b]">No producers match this view.</p>}
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#66716b]"><span>{directory.total} producers · Page {filters.page}</span><div className="flex gap-4">{filters.page > 1 && <Link href={pageLink(filters.page - 1)} className="inline-flex items-center gap-1"><ChevronLeft size={16} />Previous</Link>}{filters.page * 25 < directory.total && <Link href={pageLink(filters.page + 1)} className="inline-flex items-center gap-1">Next<ChevronRight size={16} /></Link>}</div></footer>
  </div>;
}
