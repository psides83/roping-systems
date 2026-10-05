import { createClient } from "@/lib/supabase/server";
import { RopingFunding } from "./roping-funding";
export async function RopingFundingData({ropingId,canManage}: {ropingId: string; canManage: boolean}) {
  const db = await createClient();
  const {data: r,error} = await db.from("event_ropings").select("producer_id,allow_pledged_sponsor_money,payouts_finalized_at,event_day_status").eq("id",ropingId).single();
  if (error || !r) throw new Error("Unable to load roping funding.");
  const [funds,records] = await Promise.all([db.rpc("producer_fund_availability",{target_producer_id:r.producer_id}),db.from("roping_funding").select("*").eq("event_roping_id",ropingId).order("created_at")]);
  if (funds.error || records.error) throw new Error("Unable to load added money.");
  return <RopingFunding ropingId={ropingId} canManage={canManage} funds={funds.data ?? []} records={records.data ?? []} pledged={r.allow_pledged_sponsor_money} finalized={Boolean(r.payouts_finalized_at)} completed={r.event_day_status === "completed"}/>;
}
