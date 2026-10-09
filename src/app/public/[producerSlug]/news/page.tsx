import { notFound } from "next/navigation";
import { PublicProducerHeader } from "@/components/events/public-producer-header";
import { PublicBulletins } from "@/components/news/public-bulletins";
import { rulesDocumentSchema } from "@/lib/producer-rules";
import { getBrandStyle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function PublicNewsPage({ params, searchParams }: PageProps<"/public/[producerSlug]/news">) {
  const { producerSlug } = await params;
  const query = await searchParams;
  if (!isSupabaseConfigured()) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("public_producer_bulletins", { target_slug: producerSlug });
  if (error) throw new Error("Unable to load news.");
  if (!data) notFound();
  const logoUrl = data.logoPath ? client.storage.from("organization-logos").getPublicUrl(data.logoPath).data.publicUrl : null;
  const items = (data.bulletins as { id: string; document: unknown; publishedAt: string }[]).map((item) => ({ ...item, document: rulesDocumentSchema.parse(item.document) }));
  return <main style={getBrandStyle(data.brandPrimary, data.brandAccent)} className="min-h-screen bg-[#f5f6f7]"><PublicProducerHeader slug={producerSlug} name={data.name} logoUrl={logoUrl} active="news" membershipPublished={data.membershipPublished} /><div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-10"><h1 className="text-3xl font-bold">News Bulletin</h1><PublicBulletins items={items} selected={typeof query.bulletin === "string" ? query.bulletin : undefined} /></div></main>;
}
