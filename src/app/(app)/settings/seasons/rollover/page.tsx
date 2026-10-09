import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { SeasonRolloverForm } from "@/components/settings/season-rollover-form";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { DuesSettings } from "@/lib/membership-dues";
import { formatCurrencyExact } from "@/lib/utils";

export default async function SeasonRolloverPage({ searchParams }: PageProps<"/settings/seasons/rollover">) {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) notFound();
  const db = await createClient();
  const query = await searchParams;
  const seasons = await readAllRows<{ id: string; name: string; starts_on: string; ends_on: string }>((first,last) => db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id",producer.id).order("starts_on",{ascending:false}).order("id").range(first,last), "Unable to load seasons");
  const settings = await db.from("producer_dues_settings").select("*").eq("producer_id",producer.id).maybeSingle();
  const seasonal = await readAllRows<DuesSettings & { id: string; enabled: boolean }>((first,last) => db.from("season_dues_settings").select("*").eq("producer_id",producer.id).order("id").range(first,last), "Unable to load seasonal dues");
  const funds = await db.rpc("producer_fund_availability", { target_producer_id: producer.id });
  const members = await db.from("memberships").select("id",{count:"exact",head:true}).eq("producer_id",producer.id).eq("status","active");
  const rules = await readAllRows<{ season_id: string }>((first,last) => db.from("qualification_rule_sets").select("season_id,id").eq("producer_id",producer.id).order("id").range(first,last), "Unable to load qualification templates");
  const history = await readAllRows<{ id: string; source_season_id: string; assessed_members: number; copied_qualifications: number; created_at: string; fund_balances: {id:string;name:string;balance_cents:number;available_cents:number}[] }>((first,last) => db.from("season_rollovers").select("id,source_season_id,assessed_members,copied_qualifications,created_at,fund_balances").eq("producer_id",producer.id).order("created_at",{ascending:false}).order("id").range(first,last), "Unable to load rollover history");
  if (settings.error || funds.error || members.error) throw new Error("Unable to load season rollover.");
  return <div className="space-y-5"><Link href="/settings?tab=seasons" className="text-sm font-semibold hover:underline">Back to seasons</Link><PageHeader title="Start a new season" description={producer.name}/><ProducerSettingsTabs active="seasons"/>
    {seasons.length ? <SeasonRolloverForm seasons={seasons} sourceId={typeof query.source === "string" ? query.source : seasons[0].id} settings={settings.data} seasonal={seasonal} funds={funds.data ?? []} activeMembers={members.count ?? 0} ruleCounts={Object.fromEntries(seasons.map(season => [season.id,rules.filter(rule => rule.season_id===season.id).length]))}/> : <p>Add your first season before using rollover.</p>}
    {history.length>0 && <section className="border-t pt-5"><h2 className="font-bold">Rollover history</h2><div className="mt-3 divide-y">{history.map(item => <details key={item.id} className="py-3 text-sm"><summary className="cursor-pointer font-semibold">{seasons.find(season=>season.id===item.id)?.name} · {item.assessed_members} dues accounts · {item.copied_qualifications} qualification templates</summary><p className="mt-3 text-[#66716b]">From {seasons.find(season=>season.id===item.source_season_id)?.name} · Recorded {new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:producer.timezone}).format(new Date(item.created_at))}</p><ul className="mt-3 space-y-2">{item.fund_balances.map(fund=><li key={fund.id}><Link href={`/funds/${fund.id}`} className="font-semibold hover:underline">{fund.name}</Link> · {formatCurrencyExact(Number(fund.balance_cents))} balance · {formatCurrencyExact(Number(fund.available_cents))} available at rollover</li>)}</ul></details>)}</div></section>}
  </div>;
}
