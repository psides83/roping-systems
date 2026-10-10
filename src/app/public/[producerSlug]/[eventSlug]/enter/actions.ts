"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import type { OnlineEntryEligibility } from "@/lib/online-entry-eligibility";
import { calculateEntryBalance } from "@/lib/entry-balance";
import type { RoperAccountEvent } from "@/lib/roper-accounts";
import { getPublicProducerFeatures } from "@/lib/producer-features-server";
import { featureEnabled } from "@/lib/producer-features";

export async function loadOnlineEntryEligibility(producerSlug: string, eventSlug: string, form: FormData): Promise<{ checks?: OnlineEntryEligibility[]; coveredFeeKeys?: string[]; balanceDueCents?: number; creditCents?: number; feeError?: string; error?: string }> {
  const parsed = z.object({ email: z.email(), memberNumber: z.string().trim().min(1).max(50) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your membership email and member number first." };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "Sign in and connect your membership in the roper portal to check eligibility. The producer can still review your entry request." };
  const { data, error } = await db.rpc("my_online_entry_eligibility", { target_producer_slug: producerSlug, target_event_slug: eventSlug, target_member_number: parsed.data.memberNumber, target_email: parsed.data.email });
  if (error) return { error: error.message };
  const fees = await db.rpc("my_online_entry_fee_context", { target_producer_slug: producerSlug, target_event_slug: eventSlug, target_member_number: parsed.data.memberNumber, target_email: parsed.data.email });
  if (fees.error) return { checks: data as OnlineEntryEligibility[], feeError: "Current charges could not be checked. Fee totals remain an estimate." };
  const context = fees.data as { account: RoperAccountEvent | null; coveredFeeKeys: string[] };
  const balance = calculateEntryBalance(context.account?.entries ?? [], context.account?.charges ?? [], context.account?.payments ?? []);
  return { checks: data as OnlineEntryEligibility[], coveredFeeKeys: context.coveredFeeKeys, balanceDueCents: balance.balanceDueCents, creditCents: balance.creditCents };
}

export interface OnlineEntryFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface OnlineRoperSearchResult {
  record_id: string;
  first_name: string;
  last_name: string;
  member_number: string;
  city: string | null;
  state: string | null;
}

export async function searchOnlineRopers(producerSlug: string, eventSlug: string, query: string): Promise<{ records?: OnlineRoperSearchResult[]; error?: string }> {
  const parsed = z.string().trim().min(3).max(80).safeParse(query);
  if (!parsed.success) return { error: "Enter at least three characters." };
  const db = await createClient();
  const { data, error } = await db.rpc("search_event_roper_records", { producer_slug: producerSlug, event_slug: eventSlug, search_text: parsed.data });
  if (error) return { error: "Roper search is unavailable. You can still enter your details below." };
  return { records: data as OnlineRoperSearchResult[] };
}

export async function updateOnlineEntryRequest(requestId: string, revision: number, _state: OnlineEntryFormState, form: FormData): Promise<OnlineEntryFormState> {
  const selections = z.array(z.object({ divisionId: z.uuid(), quantity: z.number().int().min(1).max(1000), optionIds: z.array(z.uuid()) })).min(1).max(100).safeParse(
    form.getAll("divisionIds").map(String).map((id) => ({ divisionId: id, quantity: Number(form.get(`quantity-${id}`)), optionIds: form.getAll(`option-${id}`).map(String) })),
  );
  const note = z.string().trim().max(500).safeParse(form.get("note") ?? "");
  if (!selections.success || !note.success) return { message: "Select at least one roping with valid entry counts and keep the note under 500 characters." };
  const db = await createClient();
  const { error } = await db.rpc("update_my_online_entry", { target_submission_id: requestId, expected_revision: revision, requested_ropings: selections.data, contestant_note: note.data });
  if (error) return { message: error.message };
  revalidatePath("/roper");
  revalidatePath("/roper/requests");
  revalidatePath("/events", "layout");
  return { success: true, message: "Your changes were saved. The producer will review the updated request." };
}

export async function loadOnlineFinalsAllowance(producerSlug: string, eventSlug: string, form: FormData) {
  const parsed = z.object({ email: z.email(), memberNumber: z.string().trim().min(1).max(50) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your membership email and member number first." };
  const db = await createClient();
  const result = await db.rpc("online_finals_entry_allowances", { target_producer_slug: producerSlug, target_event_slug: eventSlug, target_member_number: parsed.data.memberNumber, target_email: parsed.data.email });
  if (result.error) return { error: "Unable to check bonus entries. Contact the event office." };
  return { allowances: result.data as { event_roping_id: string; normal_entries: number | null; bonus_entries: number; remaining_entries: number | null }[] };
}

const onlineEntrySchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .transform(formatProperNoun),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .transform(formatProperNoun),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(40, "Phone number is too long."),
  birthDate: z.union([z.literal(""), z.iso.date()]),
  competitionGender: z.enum(["female", "male"], {
    message: "Select a competition gender.",
  }),
  memberNumber: z.string().trim().max(50, "Member number is too long."),
  note: z.string().trim().max(500, "Keep the note under 500 characters."),
  website: z.string().max(0),
});

export async function submitOnlineEntry(
  producerSlug: string,
  eventSlug: string,
  _state: OnlineEntryFormState,
  formData: FormData,
): Promise<OnlineEntryFormState> {
  if (!featureEnabled(await getPublicProducerFeatures(producerSlug), "online_entries")) return { message: "This producer is not accepting new online entry requests. Contact the producer to enter." };
  const parsed = onlineEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const divisionIds = formData.getAll("divisionIds").map(String);
  const requestedDivisions = divisionIds.flatMap((divisionId) => {
    const quantity = Number(formData.get(`quantity-${divisionId}`));
    return z.uuid().safeParse(divisionId).success &&
      Number.isInteger(quantity) &&
      quantity > 0
      ? [
          {
            divisionId,
            quantity,
            optionIds: formData
              .getAll(`option-${divisionId}`)
              .map(String)
              .filter((value) => z.uuid().safeParse(value).success),
          },
        ]
      : [];
  });

  if (!requestedDivisions.length) {
    return { errors: { divisionIds: ["Select at least one class."] } };
  }

  const supabase = await createClient();
  const selectedRecord = z.union([z.literal(""), z.uuid()]).safeParse(formData.get("selectedRecordId") ?? "");
  if (!selectedRecord.success) return { message: "Select a valid roper record or enter as a new roper." };
  const { error } = await supabase.rpc("submit_online_entry_request_v4", {
    target_organization_slug: producerSlug,
    target_roping_slug: eventSlug,
    contestant_first_name: parsed.data.firstName,
    contestant_last_name: parsed.data.lastName,
    contestant_email: parsed.data.email,
    contestant_phone: parsed.data.phone,
    contestant_birth_date: parsed.data.birthDate || null,
    contestant_competition_gender: parsed.data.competitionGender,
    contestant_member_number: parsed.data.memberNumber,
    contestant_note: parsed.data.note,
    requested_divisions: requestedDivisions,
    selected_record_id: selectedRecord.data || null,
  });

  if (error) return { message: error.message };
  return {
    success: true,
    message:
      "Your entry request was received. The producer will review it before adding it to the draw.",
  };
}
