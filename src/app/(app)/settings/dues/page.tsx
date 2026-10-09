import Link from "next/link";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { MembershipDuesSettings } from "@/components/members/dues-settings";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export default async function DuesSettingsPage() {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const client = await createClient();
  const settings = await client.from("producer_dues_settings").select("*").eq("producer_id", producer.id).maybeSingle();
  const funds = await client.from("producer_funds").select("id,name").eq("producer_id", producer.id).eq("is_active", true).order("name");
  if (settings.error || funds.error) throw new Error("Unable to load dues settings.");
  return <div className="space-y-6"><PageHeader title="Membership dues" description="Set seasonal dues and their added-money contribution." actions={<Link href="/members/dues" className="inline-flex h-10 items-center rounded-md border bg-white px-3 text-sm font-semibold">Dues ledger</Link>} /><ProducerSettingsTabs active="dues" /><MembershipDuesSettings settings={settings.data} funds={funds.data ?? []} enabled={["owner", "admin"].includes(producer.role)} /></div>;
}
