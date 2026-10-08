import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MemberFinesData } from "@/components/members/member-fines-data";
import { MemberSuspensionsData } from "@/components/members/member-suspensions-data";
import { signOut } from "@/app/auth/actions";
import { StatusPill } from "@/components/ui/status-pill";
import { PortalEntries } from "@/components/roper/portal-entries";
import { groupPortalEntries, type PortalMembership } from "@/lib/roper-portal";
import { NavigationPending } from "@/components/ui/navigation-pending";
import { PortalBalances } from "@/components/roper/portal-balances";
import { PortalSubmissions } from "@/components/roper/portal-submissions";
import type { RoperAccounts } from "@/lib/roper-accounts";
import { PortalBonusPositions } from "@/components/roper/portal-bonus-positions";
import type { RoperBonusSource } from "@/lib/roper-bonus-positions";

export default async function RoperPortal({ searchParams }: { searchParams: Promise<{ producer?: string; view?: string; season?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: portal, error } = await supabase.rpc("my_roper_portal");
  if (error) throw new Error(`Unable to load your portal: ${error.message}`);
  const memberships = (portal?.memberships ?? []) as PortalMembership[];
  const params = await searchParams;
  const member = memberships.find((item) => item.producerSlug === params.producer) ?? memberships[0];
  const view = ["entries", "history", "requests", "balances", "bonus", "membership"].includes(params.view ?? "") ? params.view! : "entries";
  const grouped = member ? groupPortalEntries(member.entries, member.today) : null;
  let accounts: RoperAccounts = { timezone: "America/Chicago", events: [], submissions: [] };
  if (member) {
    const result = await supabase.rpc("my_roper_accounts", { target_membership_id: member.id });
    if (result.error) throw new Error(`Unable to load your entry account: ${result.error.message}`);
    accounts = result.data as RoperAccounts;
  }
  const pendingCount = accounts.submissions.filter((item) => item.status === "pending").length;
  let bonus: RoperBonusSource | null = null;
  if (member && view === "bonus") {
    const result = await supabase.rpc("my_roper_bonus_positions", { target_membership_id: member.id, target_season_id: params.season || null });
    if (result.error) throw new Error(`Unable to load your bonus positions: ${result.error.message}`);
    bonus = result.data as RoperBonusSource;
  }
  return <main className="min-h-screen bg-[#f5f6f7] text-[#19231d]">
    <header className="border-b border-[#dfe4e1] bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4"><Link href="/" className="font-bold">Roping Systems</Link><form action={signOut}><button className="h-9 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">Sign out</button></form></div></header>
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-7"><h1 className="flex items-center gap-2 text-2xl font-bold"><UserRound size={24} />Roper portal</h1>
      {!member ? <p className="text-sm text-[#66716b]">No producer memberships are linked to your account yet. Contact your producer to check your account link.</p> : <>
        <form className="flex flex-wrap items-end gap-2" action="/roper"><label className="flex flex-col gap-1 text-sm font-semibold">Producer<select name="producer" defaultValue={member.producerSlug} className="h-10 w-64 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3">{memberships.map((item) => <option key={item.id} value={item.producerSlug}>{item.producerName}</option>)}</select></label><input type="hidden" name="view" value={view} /><button className="h-10 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">View</button></form>
        <section className="space-y-4 border-y border-[#dfe4e1] py-5"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold">{member.producerName}</h2><StatusPill status={member.status} /></div><p className="text-sm text-[#66716b]">Member #{member.memberNumber}{member.expiresOn ? ` · Expires ${member.expiresOn}` : ""}</p><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold"><Link href={`/public/${member.producerSlug}/schedule`}>Schedule & entries</Link><Link href={`/public/${member.producerSlug}`}>Results</Link><Link href={`/public/${member.producerSlug}/standings`}>Standings</Link></div></section>
        <nav aria-label="Portal sections" className="flex flex-wrap gap-5 border-b border-[#dfe4e1]">{[["entries", `Upcoming (${grouped!.upcoming.length})`], ["history", "Entry history"], ["requests", `Online requests${pendingCount ? ` (${pendingCount} pending)` : ""}`], ["balances", "Balances"], ["bonus", "Bonus positions"], ["membership", "Membership"]].map(([key, label]) => <Link key={key} aria-current={view === key ? "page" : undefined} href={`/roper?${new URLSearchParams({ producer: member.producerSlug, view: key })}`} className={`inline-flex items-center gap-1 border-b-2 pb-3 text-sm font-semibold ${view === key ? "border-[#384fa8] text-[#384fa8]" : "border-transparent text-[#66716b]"}`}>{label}<NavigationPending label="Loading your portal" /></Link>)}</nav>
        {bonus ? <PortalBonusPositions data={bonus} producerSlug={member.producerSlug} /> : null}
        {view === "bonus" ? null : view === "balances" ? <PortalBalances events={accounts.events} style={member.entryLabelStyle} timezone={accounts.timezone} /> : view === "requests" ? <PortalSubmissions submissions={accounts.submissions} timezone={accounts.timezone} /> : view === "membership" ? <div className="space-y-6"><section><h3 className="font-semibold">Current classifications</h3><div className="mt-3 flex flex-wrap gap-3">{member.classifications.map((item) => <span key={`${item.division}:${item.name}`} className="text-sm">{item.division}: <strong>{item.name}</strong></span>)}{!member.classifications.length ? <p className="text-sm text-[#66716b]">No classifications assigned.</p> : null}</div></section><MemberSuspensionsData membershipId={member.id} canManage={false} /><MemberFinesData membershipId={member.id} canManage={false} /></div> : <PortalEntries membership={member} entries={view === "history" ? grouped!.past : grouped!.upcoming} history={view === "history"} />}
      </>}
    </div>
  </main>;
}
