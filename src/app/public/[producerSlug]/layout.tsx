import { Suspense } from "react";
import { PublicSponsors } from "@/components/public-sponsors";
import { ProducerFeaturesProvider } from "@/components/settings/producer-features-context";
import { getPublicProducerFeatures } from "@/lib/producer-features-server";

export default async function PublicProducerLayout({children,params}:{children:React.ReactNode;params:Promise<{producerSlug:string}>}){
  const {producerSlug}=await params;
  const features = await getPublicProducerFeatures(producerSlug);
  return <ProducerFeaturesProvider features={features}>{children}<Suspense fallback={null}><PublicSponsors producerSlug={producerSlug}/></Suspense></ProducerFeaturesProvider>;
}
