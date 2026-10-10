import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { sponsorBucket,type ProducerSponsor } from "@/lib/producer-sponsors";
import { getPublicProducerFeatures } from "@/lib/producer-features-server";
import { featureEnabled } from "@/lib/producer-features";

export function SponsorGallery({sponsors}:{sponsors:(Pick<ProducerSponsor,"id"|"name"|"website_url"> & {logoUrl:string|null})[]}){
  if(!sponsors.length)return null;
  return <footer aria-label="Producer sponsors" className="border-t border-[#dfe4e1] bg-white text-[#17201c]"><div className="mx-auto max-w-6xl px-4 py-7 sm:px-6"><h2 className="text-lg font-bold">Our sponsors</h2><div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">{sponsors.map(sponsor=>{
    const content=<><span className="grid h-20 w-full place-items-center">{sponsor.logoUrl?<Image src={sponsor.logoUrl} alt={`${sponsor.name} logo`} width={176} height={80} unoptimized className="max-h-20 w-auto max-w-full object-contain"/>:<span className="break-words text-center text-lg font-bold">{sponsor.name}</span>}</span>{sponsor.logoUrl && <span className="mt-2 block break-words text-center text-sm font-semibold">{sponsor.name}</span>}</>;
    return sponsor.website_url?<a key={sponsor.id} href={sponsor.website_url} target="_blank" rel="sponsored noopener noreferrer" aria-label={`${sponsor.name} website (opens in a new tab)`} className="min-w-0 rounded-md px-2 py-2 transition-colors hover:bg-[#f5f6f7] focus-visible:outline-2 focus-visible:outline-offset-2">{content}</a>:<div key={sponsor.id} className="min-w-0 px-2 py-2">{content}</div>;
  })}</div></div></footer>;
}
export async function PublicSponsors({producerSlug}:{producerSlug:string}){
  if(!isSupabaseConfigured())return null;
  if (!featureEnabled(await getPublicProducerFeatures(producerSlug), "sponsors")) return null;
  const db=await createClient();
  const producer=await db.from("public_producer_pages").select("id").eq("slug",producerSlug).maybeSingle();
  if(producer.error)throw new Error("Unable to load producer sponsors.");
  if(!producer.data)return null;
  const sponsors=await readAllRows<Pick<ProducerSponsor,"id"|"name"|"website_url"|"logo_path">>((first,last)=>db.from("producer_sponsors").select("id,name,website_url,logo_path").eq("producer_id",producer.data!.id).eq("is_active",true).order("sort_order").order("name").order("id").range(first,last),"Unable to load sponsors");
  return <SponsorGallery sponsors={sponsors.map(s=>({...s,logoUrl:s.logo_path?db.storage.from(sponsorBucket).getPublicUrl(s.logo_path).data.publicUrl:null}))}/>;
}
