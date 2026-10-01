"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";

export interface EntryFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaymentFormState {
  success?: boolean;
  message?: string;
}

export interface TransferFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const eligibilityOverrideFields = {
  eligibilityOverride: z.string().optional(),
  eligibilityOverrideReason: z.string().trim().max(300),
};

function requireOverrideReason(
  data: { eligibilityOverride?: string; eligibilityOverrideReason: string },
  context: z.RefinementCtx,
) {
  if (
    data.eligibilityOverride === "on" &&
    data.eligibilityOverrideReason.length < 5
  )
    context.addIssue({
      code: "custom",
      path: ["eligibilityOverrideReason"],
      message: "Enter a brief reason for the eligibility override.",
    });
}

const existingEntrySchema = z
  .object({
    divisionId: z.uuid(),
    personId: z.uuid(),
    paymentStatus: z.enum(["unpaid", "paid_cash", "comped"]),
    ...eligibilityOverrideFields,
  })
  .superRefine(requireOverrideReason);

const guestEntrySchema = z
  .object({
    divisionId: z.uuid(),
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
    phone: z.string().trim(),
    birthDate: z.union([z.literal(""), z.iso.date()]),
    paymentStatus: z.enum(["unpaid", "paid_cash", "comped"]),
    ...eligibilityOverrideFields,
  })
  .superRefine(requireOverrideReason);

const reviewRequestSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["accepted", "declined"]),
    reviewNote: z
      .string()
      .trim()
      .max(500, "Keep the note under 500 characters."),
    eligibilityOverride: z.string().optional(),
  })
  .superRefine((data, context) => {
    if (
      data.decision === "accepted" &&
      data.eligibilityOverride === "on" &&
      data.reviewNote.length < 5
    )
      context.addIssue({
        code: "custom",
        path: ["reviewNote"],
        message: "Explain the eligibility override in the office note.",
      });
  });

const paymentSchema = z.object({
  personId: z.uuid(),
  paymentStatus: z.enum(["unpaid", "paid_cash", "comped", "refunded"]),
});

const transferSchema = z
  .object({
    destinationDivisionId: z.uuid("Choose a destination class."),
    reason: z
      .string()
      .trim()
      .min(1, "Enter a reason for moving this entry.")
      .max(240, "Keep the reason under 240 characters."),
    ...eligibilityOverrideFields,
  })
  .superRefine(requireOverrideReason);

async function requireManager() {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

function getOptionIds(formData: FormData) {
  return formData
    .getAll("optionIds")
    .map(String)
    .filter((value) => z.uuid().safeParse(value).success);
}

async function addSelectedOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryId: string,
  optionIds: string[],
) {
  for (const optionId of optionIds) {
    const { error } = await supabase.rpc("add_entry_option", {
      target_entry_id: entryId,
      target_roping_fee_id: optionId,
    });
    if (error) return error;
  }
  return null;
}

export async function addExistingEntry(
  ropingId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = existingEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };
  const { data: entryId, error } = await context.supabase.rpc(
    "create_event_entry_with_eligibility_override",
    {
      target_roping_division_id: parsed.data.divisionId,
      target_person_id: parsed.data.personId,
      entry_origin: "office",
      initial_payment_status: parsed.data.paymentStatus,
      entered_override_reason:
        parsed.data.eligibilityOverride === "on"
          ? parsed.data.eligibilityOverrideReason
          : null,
    },
  );
  if (error) return { message: error.message };
  const optionError = await addSelectedOptions(
    context.supabase,
    entryId,
    getOptionIds(formData),
  );
  if (optionError)
    return {
      message: `Entry added, but an option could not be applied: ${optionError.message}`,
    };
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return { success: true, message: "Entry added and fees calculated." };
}

export async function addGuestEntry(
  ropingId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = guestEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };
  const { data: entryId, error } = await context.supabase.rpc(
    "create_guest_event_entry_with_eligibility_override",
    {
      target_roping_division_id: parsed.data.divisionId,
      guest_first_name: parsed.data.firstName,
      guest_last_name: parsed.data.lastName,
      guest_email: parsed.data.email,
      guest_phone: parsed.data.phone,
      guest_birth_date: parsed.data.birthDate || null,
      initial_payment_status: parsed.data.paymentStatus,
      entered_override_reason:
        parsed.data.eligibilityOverride === "on"
          ? parsed.data.eligibilityOverrideReason
          : null,
    },
  );
  if (error) return { message: error.message };
  const optionError = await addSelectedOptions(
    context.supabase,
    entryId,
    getOptionIds(formData),
  );
  if (optionError)
    return {
      message: `Entry added, but an option could not be applied: ${optionError.message}`,
    };
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return { success: true, message: "Guest entry added and fees calculated." };
}

export async function reviewOnlineEntryRequest(
  ropingId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = reviewRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };

  const { data, error } = await context.supabase.rpc(
    "review_online_entry_request_with_eligibility_override",
    {
      target_request_id: parsed.data.requestId,
      review_decision: parsed.data.decision,
      entered_review_note: parsed.data.reviewNote,
      override_eligibility: parsed.data.eligibilityOverride === "on",
    },
  );
  if (error) return { message: error.message };

  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return {
    success: true,
    message:
      parsed.data.decision === "accepted"
        ? `${data} ${data === 1 ? "entry was" : "entries were"} added.`
        : "Request declined.",
  };
}

export async function updateContestantPayment(
  ropingId: string,
  _state: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Choose a valid payment status." };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };

  const { data, error } = await context.supabase.rpc(
    "set_contestant_event_payment_status",
    {
      target_roping_id: ropingId,
      target_person_id: parsed.data.personId,
      new_payment_status: parsed.data.paymentStatus,
    },
  );
  if (error) return { message: error.message };

  revalidatePath(`/ropings/${ropingId}/entries`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "entry" : "entries"} updated.`,
  };
}

export async function transferEntry(
  ropingId: string,
  entryId: string,
  _state: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };

  const { error } = await context.supabase.rpc(
    "transfer_event_entry_with_eligibility_override",
    {
      target_entry_id: entryId,
      target_division_id: parsed.data.destinationDivisionId,
      transfer_reason: parsed.data.reason,
      entered_override_reason:
        parsed.data.eligibilityOverride === "on"
          ? parsed.data.eligibilityOverrideReason
          : null,
    },
  );
  if (error) return { message: error.message };

  revalidatePath(`/ropings/${ropingId}`);
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  revalidatePath(`/ropings/${ropingId}/payouts`);
  return { success: true, message: "Entry moved to the new class." };
}
