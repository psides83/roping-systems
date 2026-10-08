import { notFound } from "next/navigation";
import { PublicProducerHeader } from "@/components/events/public-producer-header";
import { RulesContent } from "@/components/rules/rules-content";
import { rulesDocumentSchema } from "@/lib/producer-rules";
import { getBrandStyle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function PublicRulesPage({ params }: PageProps<"/public/[producerSlug]/rules">) {
  const { producerSlug } = await params;
  if (!isSupabaseConfigured()) notFound();
  const client = await createClient();
  const { data, error } = await client.rpc("public_producer_rules", { target_slug: producerSlug });
  if (error) throw new Error("Unable to load public rules.");
  if (!data) notFound();
  const logoUrl = data.logoPath ? client.storage.from("organization-logos").getPublicUrl(data.logoPath).data.publicUrl : null;
  return <main style={getBrandStyle(data.brandPrimary, data.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
    <PublicProducerHeader slug={producerSlug} name={data.name} logoUrl={logoUrl} active="rules" membershipPublished={data.membershipPublished} />
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      {data.document ? <RulesContent document={rulesDocumentSchema.parse(data.document)} updatedAt={data.publishedAt} /> : <><h1 className="text-3xl font-bold">Rules</h1><p className="mt-4 text-sm text-[#66716b]">This producer has not published rules yet.</p></>}
    </div>
  </main>;
}
