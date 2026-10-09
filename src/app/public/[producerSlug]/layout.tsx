import { Suspense } from "react";
import { PublicSponsors } from "@/components/public-sponsors";

export default async function PublicProducerLayout({children,params}:{children:React.ReactNode;params:Promise<{producerSlug:string}>}){
  const {producerSlug}=await params;
  return <>{children}<Suspense fallback={null}><PublicSponsors producerSlug={producerSlug}/></Suspense></>;
}
