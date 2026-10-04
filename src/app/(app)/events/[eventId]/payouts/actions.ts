"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export async function initializePayoutPlans(eventId: string) {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return;
  const supabase = await createClient();
  await supabase.rpc("initialize_roping_payout_plans", {
    target_roping_id: eventId,
  });
  revalidatePath(`/events/${eventId}/payouts`);
}

export interface PayoutAwardActionInput {
  planId: string;
  entryId: string;
  awardKey: string;
  sectionType: string;
  roundNumber: number | null;
  dNumber: number | null;
  place: number;
  contestantName: string;
  amountCents: number;
}

export async function setPayoutPaid(
  eventId: string,
  award: PayoutAwardActionInput,
  paid: boolean,
) {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return;
  const supabase = await createClient();

  const { error } = paid
    ? await supabase.rpc("record_payout_disbursement", {
        target_plan_id: award.planId,
        target_entry_id: award.entryId,
        target_award_key: award.awardKey,
        target_section_type: award.sectionType,
        target_round_number: award.roundNumber,
        target_d_number: award.dNumber,
        target_place_number: award.place,
        target_contestant_name: award.contestantName,
        target_amount_cents: award.amountCents,
      })
    : await supabase.rpc("remove_payout_disbursement", {
        target_plan_id: award.planId,
        target_award_key: award.awardKey,
      });

  if (error) throw new Error(`Unable to update payout: ${error.message}`);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/payouts`);
}
