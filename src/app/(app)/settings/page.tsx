import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsForm } from "@/components/settings/producer-settings-form";
import { ProducerSeasons } from "@/components/settings/producer-seasons";
import { ProducerLogoForm } from "@/components/settings/producer-logo-form";
import { ProducerBrandingForm } from "@/components/settings/producer-branding-form";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { getProducerSettingsData } from "@/lib/producer-settings-data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const query = await searchParams;
  const tab = query.tab === "appearance" ? "appearance" : query.tab === "seasons" ? "seasons" : "general";
  const data = await getProducerSettingsData(tab === "seasons");
  const configured = isSupabaseConfigured();
  const canEdit = configured && ["owner", "admin"].includes(data.role);
  return <div className="space-y-5">
    <PageHeader title="Producer settings" description={data.producer.publicName || data.producer.name}
      actions={<Link href="/settings/classifications" className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><SlidersHorizontal size={16} />Roping setup</Link>} />
    <ProducerSettingsTabs active={tab} />
    <section aria-label={`${tab === "general" ? "General" : tab === "appearance" ? "Appearance" : "Season"} settings`} className="max-w-3xl py-2">
      {tab === "general" && <ProducerSettingsForm producer={data.producer} canEdit={canEdit} />}
      {tab === "appearance" && <>
        <ProducerLogoForm key={data.producer.logoUrl ?? "no-logo"} producerName={data.producer.publicName || data.producer.name} logoUrl={data.producer.logoUrl} canEdit={canEdit}
          readOnlyMessage={configured ? "Only owners and administrators can change the logo." : "Connect Supabase to upload a producer logo."} />
        <ProducerBrandingForm key={`${data.producer.brandPrimary}:${data.producer.brandAccent}`} primary={data.producer.brandPrimary} accent={data.producer.brandAccent} canEdit={canEdit}
          readOnlyMessage={configured ? "Only owners and administrators can change brand colors." : "Connect Supabase to save producer colors."} />
      </>}
      {tab === "seasons" && <ProducerSeasons seasons={data.seasons} canEdit={canEdit} />}
    </section>
  </div>;
}
