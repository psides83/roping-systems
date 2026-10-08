import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { RulesEditor } from "@/components/rules/rules-editor";
import { getActiveProducer } from "@/lib/producers";
import { emptyRules, rulesDocumentSchema } from "@/lib/producer-rules";
import { createClient } from "@/lib/supabase/server";

export default async function RulesSettingsPage() {
  const producer = await getActiveProducer();
  const enabled = Boolean(producer && ["owner", "admin"].includes(producer.role));
  let row: { draft: unknown; revision: number; published: unknown } | null = null;
  if (enabled && producer) {
    const client = await createClient();
    const { data, error } = await client.from("producer_rules").select("draft,revision,published").eq("producer_id", producer.id).maybeSingle();
    if (error) throw new Error("Unable to load public rules.");
    row = data;
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="Producer setup" title="Public rules" description="Prepare your rules, then publish them for members and visitors." actions={producer && <Link href={`/public/${producer.slug}/rules`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">View public rules<ExternalLink size={15} /></Link>} />
    <ProducerSettingsTabs active="rules" />
    {enabled ? <RulesEditor initial={row ? rulesDocumentSchema.parse(row.draft) : emptyRules} initialRevision={row?.revision ?? 0} initialPublished={Boolean(row?.published)} /> : <p className="text-sm text-[#66716b]">Only producer owners and administrators can edit public rules.</p>}
  </div>;
}
