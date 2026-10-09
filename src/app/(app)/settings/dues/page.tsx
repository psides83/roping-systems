import Link from "next/link";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { MembershipDuesSettings } from "@/components/members/dues-settings";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export default async function DuesSettingsPage({searchParams}:PageProps<"/settings/dues">) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const client = await createClient();
  const query=await searchParams;
  const seasons=await client.from("producer_seasons").select("id,name").eq("producer_id",producer.id).order("starts_on",{ascending:false});
  const selected=typeof query.season==="string" ? seasons.data?.find(s=>s.id===query.season):undefined;
  const settings = await client.from("producer_dues_settings").select("*").eq("producer_id", producer.id).maybeSingle();
  const seasonal=selected ? await client.from("season_dues_settings").select("*").eq("id",selected.id).eq("producer_id",producer.id).maybeSingle():null;
  const funds = await client.from("producer_funds").select("id,name").eq("producer_id", producer.id).eq("is_active", true).order("name");
  if (settings.error || funds.error || seasons.error || seasonal?.error) throw new Error("Unable to load dues settings.");
  const effective=selected ? seasonal?.data ?? (settings.data ? {...settings.data,revision:0}:null):settings.data;
  return <div className="space-y-6"><PageHeader title="Membership dues" description="Set seasonal dues and their added-money contribution." actions={<Link href="/members/dues" className="inline-flex h-10 items-center rounded-md border bg-white px-3 text-sm font-semibold">Dues ledger</Link>} /><ProducerSettingsTabs active="dues" />
    <form className="flex flex-wrap items-end gap-2"><label className="grid gap-2 text-sm font-semibold">Configuration<select name="season" defaultValue={selected?.id ?? ""} className="h-10 w-52 max-w-full rounded-md border bg-white pl-3 pr-9"><option value="">Producer defaults</option>{seasons.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="h-10 rounded-md border px-3 text-sm font-semibold">View</button></form>
    <p className="text-sm text-[#66716b]">{selected ? `Settings for ${selected.name}. Previously assessed charges remain unchanged.`:"Defaults apply only to seasons without their own dues settings."}</p>
    <MembershipDuesSettings key={selected?.id ?? "default"} season={selected?.id} settings={effective} funds={funds.data ?? []} enabled={["owner", "admin"].includes(producer.role)} /></div>;
}
