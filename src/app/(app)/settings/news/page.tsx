import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { BulletinManager } from "@/components/news/bulletin-manager";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export default async function NewsSettingsPage() {
  const producer = await getActiveProducer();
  const enabled = Boolean(producer && ["owner", "admin"].includes(producer.role));
  const client = await createClient();
  const { data, error } = enabled ? await client.from("producer_bulletins").select("id,draft,published,revision,updated_at").eq("producer_id", producer!.id).order("updated_at", { ascending: false }) : { data: [], error: null };
  if (error) throw new Error("Unable to load news bulletins.");
  return <div className="space-y-6">
    <PageHeader eyebrow="Producer setup" title="News Bulletin" description="Prepare announcements and publish them when they are ready." actions={<div className="flex flex-wrap gap-2">{producer && <Link className="inline-flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold" href={`/public/${producer.slug}/news`} target="_blank" rel="noopener noreferrer">Public news<ExternalLink size={16} /></Link>}{enabled && <Link className="brand-accent-fill inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-white" href="/settings/news/new"><Plus size={16} />New bulletin</Link>}</div>} />
    <ProducerSettingsTabs active="news" />
    {enabled ? <BulletinManager items={(data ?? []).map((row) => ({ id: row.id, title: row.draft.title || "Untitled bulletin", date: row.draft.effectiveOn, published: Boolean(row.published), revision: row.revision, changed: Boolean(row.published && JSON.stringify(row.draft) !== JSON.stringify(row.published)) }))} /> : <p>Only producer owners and administrators can manage news.</p>}
  </div>;
}
