import Link from "next/link";
import { Filter } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DuesWorkspace } from "@/components/members/dues-workspace";
import { duesTotals, type DuesAccount, type DuesSettings } from "@/lib/membership-dues";
import { getActiveProducer } from "@/lib/producers";
import { seasonCalendarDate } from "@/lib/seasons";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyExact as formatCurrency } from "@/lib/utils";

export default async function DuesPage({ searchParams }: PageProps<"/members/dues">) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const client = await createClient();
  const query = await searchParams;
  const seasons = await client.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const today = seasonCalendarDate(new Date().toISOString(), producer.timezone)!;
  const current = seasons.data?.find((season) => today >= season.starts_on && today <= season.ends_on);
  const selected = query.season === "all" ? undefined : seasons.data?.find((season) => season.id === (query.season ?? current?.id));
  let accountQuery = client.from("membership_dues").select("*,payments:membership_dues_payments(*)").eq("producer_id", producer.id).order("created_at", { ascending: false });
  if (selected) accountQuery = accountQuery.eq("season_id", selected.id);
  const accounts = await accountQuery;
  const settings = await client.from("producer_dues_settings").select("*").eq("producer_id", producer.id).maybeSingle();
  const seasonal = await client.from("season_dues_settings").select("*").eq("producer_id",producer.id);
  const members = await client.from("memberships").select("id,member_number,ropers!inner(first_name,last_name)").eq("producer_id", producer.id).order("member_number");
  const funds = await client.from("producer_funds").select("id,name,is_active").eq("producer_id", producer.id).order("name");
  if (seasons.error || accounts.error || settings.error || seasonal.error || members.error || funds.error) throw new Error("Unable to load membership dues.");
  const rows = ((accounts.data ?? []) as DuesAccount[]).map((account) => ({ ...account, payments: [...account.payments].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) }));
  const total = duesTotals(rows);
  const choices = (members.data ?? []).map((member) => { const roper = member.ropers as unknown as { first_name: string; last_name: string }; return { id: member.id, name: `${roper.first_name} ${roper.last_name} · ${member.member_number}` }; });
  return <div className="space-y-6"><Link href="/members" className="text-sm font-semibold hover:underline">Back to members</Link><PageHeader title="Membership dues" description="Seasonal charges, collected dues, and added-money contributions." actions={<Link href="/settings/dues" className="inline-flex h-10 items-center rounded-md border bg-white px-3 text-sm font-semibold">Dues settings</Link>} />
    <form className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm font-semibold">Season<select name="season" defaultValue={selected?.id ?? "all"} className="h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-3 pr-9"><option value="all">All seasons</option>{seasons.data?.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button title="Apply season filter" aria-label="Apply season filter" className="grid h-10 w-10 place-items-center rounded-md border bg-white"><Filter size={17} /></button></form>
    <section className="flex flex-wrap gap-x-10 gap-y-5 border-y border-[#d7ddda] py-5">{[["Dues charged", total.charged], ["Collected", total.collected], ["Outstanding", total.outstanding], ["Contributed to funds", total.contributed], ["Retained dues", total.retained]].map(([label, amount]) => <div key={String(label)}><p className="text-sm text-[#66716b]">{label}</p><p className="mt-1 text-2xl font-bold">{formatCurrency(Number(amount))}</p></div>)}</section>
    {!settings.data && !(seasonal.data ?? []).some(row=>row.enabled) && <p className="text-sm text-[#66716b]">Membership dues have not been configured. <Link href="/settings/dues" className="font-semibold underline">Set up dues</Link></p>}
    <DuesWorkspace key={selected?.id ?? "all"} accounts={rows} members={choices} seasons={seasons.data ?? []} funds={funds.data ?? []} settings={settings.data} seasonalSettings={Object.fromEntries((seasonal.data ?? []).map(row=>[row.id,row.enabled ? row as DuesSettings : null]))} canManage={producer.role !== "viewer" || Boolean(producer.treasurer)} season={selected?.id} member={typeof query.member === "string" ? query.member : undefined} timezone={producer.timezone} />
  </div>;
}
