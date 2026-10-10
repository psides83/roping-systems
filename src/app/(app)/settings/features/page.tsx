import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { ProducerFeaturesForm } from "@/components/settings/producer-features-form";
import { PageHeader } from "@/components/ui/page-header";
export default async function FeaturesPage() {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const db = await createClient();
  const { data, error } = await db.from("producer_feature_preferences").select("features,revision").eq("producer_id", producer.id).maybeSingle();
  if (error) throw new Error("Unable to load feature preferences.");
  return <div className="space-y-6">
    <PageHeader title="Features" description="Choose the optional tools your producer uses." />
    <ProducerSettingsTabs active="features" />
    <p className="max-w-2xl text-sm text-[#66716b]">Existing records and competition rules are preserved. Tools needed to manage existing dues, fines, suspensions, expenses, and qualifications remain available. Hidden sections can still be opened from existing links.</p>
    <ProducerFeaturesForm features={data?.features ?? {}} revision={data?.revision ?? 0} editable={["owner","admin"].includes(producer.role)} />
  </div>;
}
