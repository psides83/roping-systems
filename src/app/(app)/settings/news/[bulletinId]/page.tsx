import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RulesEditor } from "@/components/rules/rules-editor";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { emptyRules, rulesDocumentSchema } from "@/lib/producer-rules";
import { createClient } from "@/lib/supabase/server";
import { saveBulletin } from "../actions";

export default async function BulletinEditorPage({ params, searchParams }: PageProps<"/settings/news/[bulletinId]">) {
  const { bulletinId } = await params;
  const query = await searchParams;
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role) || !z.uuid().safeParse(bulletinId).success) notFound();
  const client = await createClient();
  const { data, error } = await client.from("producer_bulletins").select("draft,published,revision").eq("producer_id", producer.id).eq("id", bulletinId).maybeSingle();
  if (error) throw new Error("Unable to load bulletin.");
  if (!data && query.new !== "1") notFound();
  return <div className="space-y-5"><Link href="/settings/news" className="text-sm font-semibold hover:underline">Back to news</Link><PageHeader title={data ? "Edit bulletin" : "New bulletin"} description="Save a private draft or publish an announcement." /><RulesEditor kind="bulletin" initial={data ? rulesDocumentSchema.parse(data.draft) : { ...emptyRules, title: "" }} initialRevision={data?.revision ?? 0} initialPublished={Boolean(data?.published)} saveAction={saveBulletin.bind(null, bulletinId)} /></div>;
}
