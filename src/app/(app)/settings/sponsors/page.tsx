import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { SponsorManager } from "@/components/settings/sponsor-manager";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { sponsorBucket,type ProducerSponsor } from "@/lib/producer-sponsors";

export default async function SponsorsPage(){
  const producer=await getActiveProducer();if(!producer || !["owner","admin"].includes(producer.role))notFound();
  const db=await createClient();
  const sponsors=await readAllRows<ProducerSponsor>((first,last)=>db.from("producer_sponsors").select("id,name,website_url,logo_path,sort_order,is_active,revision").eq("producer_id",producer.id).order("sort_order").order("name").order("id").range(first,last),"Unable to load sponsors");
  return <div className="space-y-5"><PageHeader title="Sponsors" description={producer.name}/><ProducerSettingsTabs active="sponsors"/><SponsorManager sponsors={sponsors.map(s=>({...s,logoUrl:s.logo_path ? db.storage.from(sponsorBucket).getPublicUrl(s.logo_path).data.publicUrl:null}))}/></div>;
}
