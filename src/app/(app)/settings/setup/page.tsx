import { HelpLink } from "@/components/help/help-link";
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
    <PageHeader title="Setup checklist" description={data.name} actions={<><HelpLink guide="first-setup" label="Getting started" /><SetupRefreshButton /><Link href="/events" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><CalendarPlus size={17} />Events</Link></>} />
    <ProducerSettingsTabs active="setup" />
    <div className="max-w-4xl space-y-5">
      <section aria-labelledby="setup-path" className="rounded-lg border border-[#dfe4e1] bg-white p-5">
        <h2 id="setup-path" className="font-bold">From setup to your first event</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          <li><p className="text-sm font-semibold">1. Define your competitions</p><p className="mt-1 text-sm leading-6 text-[#66716b]">Divisions organize competition types. Classifications describe the ropers who can enter.</p><Link href="/settings/classifications" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-accent-strong)]">Review divisions &amp; classifications</Link></li>
          <li><p className="text-sm font-semibold">2. Save reusable defaults</p><p className="mt-1 text-sm leading-6 text-[#66716b]">Templates hold formats, rounds, entry allowances, fees, and timing settings.</p><Link href="/settings/roping-templates" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-accent-strong)]">Review templates</Link></li>
          <li><p className="text-sm font-semibold">3. Build the schedule</p><p className="mt-1 text-sm leading-6 text-[#66716b]">Create an event, then add each actual roping to its day and arena.</p><Link href="/events" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--brand-accent-strong)]">Open events</Link></li>
        </ol>
      </section>
      <p className="text-sm leading-6 text-[#66716b]">Setup checks are guidance, not event restrictions. Optional features can stay unconfigured.</p>
      {!data.configured ? <p className="border-l-4 border-amber-400 bg-amber-50 p-4 text-sm">Preview only. Connect Supabase to review your producer&apos;s saved settings.</p> : data.role === "viewer" ? <p className="border-l-4 border-[#ccd4d0] p-3 text-sm text-[#66716b]">Read-only review. Ask a producer administrator to update these settings.</p> : null}
      <ProducerSetupChecklist items={data.items} />
      <p className="border-t border-[#d7ddda] pt-4 text-xs text-[#66716b]">Checked <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString("en-US", { timeZone: data.timezone, timeZoneName: "short" })}</time> · Based on saved settings. Event schedules and copied roping settings have their own readiness review.</p>
    </div>
  </div>;
}
