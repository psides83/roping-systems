"use server";

import { revalidatePath } from "next/cache";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export async function initializePayoutPlans(ropingId: string) {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return;
  const supabase = await createClient();
  await supabase.rpc("initialize_roping_payout_plans", { target_roping_id: ropingId });
  revalidatePath(`/ropings/${ropingId}/payouts`);
}
