import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { ProducerSetupChecklist } from "@/components/settings/producer-setup-checklist";
import { loadProducerSetup } from "@/lib/producer-setup-data";
import { SetupRefreshButton } from "@/components/settings/setup-refresh-button";

export default async function ProducerSetupPage() {
  const data = await loadProducerSetup();
  return <div className="space-y-5">
    <PageHeader title="Setup checklist" description={data.name} actions={<><SetupRefreshButton /><Link href="/events" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><CalendarPlus size={17} />Events</Link></>} />
    <ProducerSettingsTabs active="setup" />
    <div className="max-w-4xl space-y-5">
      <p className="text-sm leading-6 text-[#66716b]">Setup checks are guidance, not event restrictions. Optional features can stay unconfigured.</p>
      {!data.configured ? <p className="border-l-4 border-amber-400 bg-amber-50 p-4 text-sm">Preview only. Connect Supabase to review your producer&apos;s saved settings.</p> : data.role === "viewer" ? <p className="border-l-4 border-[#ccd4d0] p-3 text-sm text-[#66716b]">Read-only review. Ask a producer administrator to update these settings.</p> : null}
      <ProducerSetupChecklist items={data.items} />
      <p className="border-t border-[#d7ddda] pt-4 text-xs text-[#66716b]">Checked <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString("en-US", { timeZone: data.timezone, timeZoneName: "short" })}</time> · Based on saved settings. Event schedules and copied roping settings have their own readiness review.</p>
    </div>
  </div>;
}
