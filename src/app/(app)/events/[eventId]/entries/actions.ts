"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import { refreshEventQualificationChecks } from "@/lib/events/qualification-checks";
import { eventStaffAccess } from "@/lib/staff-access";

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

export interface EntryOptionFormState {
  success?: boolean;
  message?: string;
}

export interface ChargeWaiverFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface EntryWithdrawalFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface CheckInFormState {
  success?: boolean;
  message?: string;
}

export interface CashPaymentFormState {
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
    email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
    phone: z.string().trim(),
    birthDate: z.union([z.literal(""), z.iso.date()]),
    competitionGender: z.enum(["female", "male"]),
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

const chargeWaiverSchema = z.object({
  action: z.enum(["waive", "restore"]),
  reason: z
    .string()
    .trim()
    .min(5, "Enter a brief reason for this fee correction.")
    .max(300, "Keep the reason under 300 characters."),
});

const entryWithdrawalSchema = z.object({
  action: z.enum(["withdraw", "reinstate"]),
  financialAction: z
    .enum(["keep_charges", "waive_charges", "refund"])
    .optional(),
  reason: z
    .string()
    .trim()
    .min(5, "Enter a brief reason for this change.")
    .max(300, "Keep the reason under 300 characters."),
});

const cashPaymentSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Enter a payment amount greater than zero.")
    .max(1000000, "Enter a smaller payment amount."),
  note: z.string().trim().max(240, "Keep the note under 240 characters."),
});

const voidPaymentSchema = z.object({
  reason: z.string().trim().min(5, "Enter a brief correction reason.").max(240),
});

async function requireManager(eventId: string) {
  return eventStaffAccess(eventId, "can_manage_event");
}

function getOptionIds(formData: FormData) {
  return formData
    .getAll("optionIds")
    .map(String)
    .filter((value) => z.uuid().safeParse(value).success);
}

async function requireEntryOffice(eventId: string) {
  const producer = await getActiveProducer();
  if (!producer) return null;
  const supabase = await createClient();
  const event = await supabase.from("events").select("id").eq("id", eventId).eq("producer_id", producer.id).maybeSingle();
  const permission = await supabase.rpc("can_enter_event", { target_event: eventId });
  if (event.error || !event.data || permission.error || !permission.data) return null;
  return { producer, supabase };
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
  eventId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = existingEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };
  const roping = await context.supabase.from("event_ropings").select("id").eq("id", parsed.data.divisionId).eq("event_id", eventId).maybeSingle();
  if (roping.error || !roping.data) return { message: "Choose a roping from this event." };
  const qualificationError = await refreshEventQualificationChecks(eventId, parsed.data.divisionId);
  if (qualificationError) return { message: qualificationError };
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
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  return { success: true, message: "Entry added and fees calculated." };
}

export async function addGuestEntry(
  eventId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = guestEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };
  const roping = await context.supabase.from("event_ropings").select("id").eq("id", parsed.data.divisionId).eq("event_id", eventId).maybeSingle();
  if (roping.error || !roping.data) return { message: "Choose a roping from this event." };
  const qualificationError = await refreshEventQualificationChecks(eventId, parsed.data.divisionId);
  if (qualificationError) return { message: qualificationError };
  const { data: entryId, error } = await context.supabase.rpc(
    "create_guest_event_entry_v2_with_eligibility_override",
    {
      target_roping_division_id: parsed.data.divisionId,
      guest_first_name: parsed.data.firstName,
      guest_last_name: parsed.data.lastName,
      guest_email: parsed.data.email,
      guest_phone: parsed.data.phone,
      guest_birth_date: parsed.data.birthDate || null,
      guest_competition_gender: parsed.data.competitionGender,
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
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  return { success: true, message: "Guest entry added and fees calculated." };
}

export async function reviewOnlineEntryRequest(
  eventId: string,
  _state: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const parsed = reviewRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };
  const request = await context.supabase.from("online_entry_submissions").select("id").eq("id", parsed.data.requestId).eq("event_id", eventId).maybeSingle();
  if (request.error || !request.data) return { message: "Choose a request from this event." };

  if (parsed.data.decision === "accepted") {
    const qualificationError = await refreshEventQualificationChecks(eventId);
    if (qualificationError) return { message: qualificationError };
  }
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

  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  return {
    success: true,
    message:
      parsed.data.decision === "accepted"
        ? `${data} ${data === 1 ? "entry was" : "entries were"} added.`
        : "Request declined.",
  };
}

export async function correctContestantContact(eventId: string, roperId: string, _state: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const parsed = z.object({
    email: z.union([z.literal(""), z.email()]),
    phone: z.string().trim(),
    reason: z.string().trim().min(5, "Enter a brief correction reason.").max(300),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message };
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };
  const { error } = await context.supabase.rpc("correct_event_roper_contact", {
    target_event: eventId, target_roper: roperId, contact_email: parsed.data.email,
    contact_phone: parsed.data.phone, correction_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath("/members");
  return { success: true, message: "Contact details corrected." };
}

export async function updateContestantPayment(
  eventId: string,
  _state: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: "Choose a valid payment status." };
  const context = await eventStaffAccess(eventId, "can_adjust_event_finances");
  if (!context) return { message: "Manager access is required." };

  const { data, error } = await context.supabase.rpc(
    "set_contestant_event_payment_status",
    {
      target_roping_id: eventId,
      target_person_id: parsed.data.personId,
      new_payment_status: parsed.data.paymentStatus,
    },
  );
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  return {
    success: true,
    message: `${data} ${data === 1 ? "entry" : "entries"} updated.`,
  };
}

export async function transferEntry(
  eventId: string,
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
  const context = await requireManager(eventId);
  if (!context) return { message: "Manager access is required." };

  const qualificationError = await refreshEventQualificationChecks(eventId, parsed.data.destinationDivisionId);
  if (qualificationError) return { message: qualificationError };
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

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  revalidatePath(`/events/${eventId}/payouts`);
  return { success: true, message: "Entry moved to the new class." };
}

export async function updateEntryOptions(
  eventId: string,
  entryId: string,
  _state: EntryOptionFormState,
  formData: FormData,
): Promise<EntryOptionFormState> {
  if (!z.uuid().safeParse(entryId).success)
    return { message: "This entry is unavailable." };
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };
  const entry = await context.supabase.from("roping_entries").select("id").eq("id", entryId).eq("event_id", eventId).maybeSingle();
  if (entry.error || !entry.data) return { message: "Choose an entry from this event." };

  const optionIds = getOptionIds(formData);
  const { data, error } = await context.supabase.rpc("set_entry_options", {
    target_entry_id: entryId,
    selected_roping_fee_ids: optionIds,
  });
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/payouts`);
  return {
    success: true,
    message: `${data} optional ${data === 1 ? "fee" : "fees"} selected.`,
  };
}

export async function updateChargeWaiver(
  eventId: string,
  chargeId: string,
  _state: ChargeWaiverFormState,
  formData: FormData,
): Promise<ChargeWaiverFormState> {
  if (!z.uuid().safeParse(chargeId).success)
    return { message: "This charge is unavailable." };
  const parsed = chargeWaiverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await eventStaffAccess(eventId, "can_adjust_event_finances");
  if (!context) return { message: "Manager access is required." };

  const shouldWaive = parsed.data.action === "waive";
  const { error } = await context.supabase.rpc("set_entry_charge_waiver", {
    target_charge_id: chargeId,
    should_waive: shouldWaive,
    adjustment_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/payouts`);
  return {
    success: true,
    message: shouldWaive ? "Charge waived." : "Charge restored.",
  };
}

export async function changeEntryWithdrawal(
  eventId: string,
  entryId: string,
  _state: EntryWithdrawalFormState,
  formData: FormData,
): Promise<EntryWithdrawalFormState> {
  if (!z.uuid().safeParse(entryId).success)
    return { message: "This entry is unavailable." };
  const parsed = entryWithdrawalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  if (parsed.data.action === "withdraw" && !parsed.data.financialAction)
    return { message: "Choose how to handle this entry’s charges." };

  const context = await requireManager(eventId);
  if (!context) return { message: "Manager access is required." };

  if (parsed.data.action === "reinstate") {
    const qualificationError = await refreshEventQualificationChecks(eventId);
    if (qualificationError) return { message: qualificationError };
  }
  const result =
    parsed.data.action === "withdraw"
      ? await context.supabase.rpc("withdraw_event_entry", {
          target_entry_id: entryId,
          withdrawal_reason: parsed.data.reason,
          selected_financial_action: parsed.data.financialAction,
        })
      : await context.supabase.rpc("reinstate_event_entry", {
          target_entry_id: entryId,
          reinstatement_reason: parsed.data.reason,
        });
  if (result.error) return { message: result.error.message };

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/live`);
  revalidatePath(`/events/${eventId}/payouts`);
  return {
    success: true,
    message:
      parsed.data.action === "withdraw"
        ? "Entry withdrawn."
        : "Entry reinstated.",
  };
}

export async function updateContestantCheckIn(
  eventId: string,
  personId: string,
  _state: CheckInFormState,
  formData: FormData,
): Promise<CheckInFormState> {
  if (!z.uuid().safeParse(personId).success)
    return { message: "This contestant is unavailable." };
  const checkedIn = formData.get("checkedIn") === "true";
  const context = await requireEntryOffice(eventId);
  if (!context) return { message: "Entry access for this event is required." };

  const { error } = await context.supabase.rpc(
    "set_event_contestant_check_in",
    {
      target_roping_id: eventId,
      target_person_id: personId,
      is_checked_in: checkedIn,
    },
  );
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  return {
    success: true,
    message: checkedIn ? "Contestant checked in." : "Check-in undone.",
  };
}

export async function recordCashPayment(
  eventId: string,
  personId: string,
  _state: CashPaymentFormState,
  formData: FormData,
): Promise<CashPaymentFormState> {
  if (!z.uuid().safeParse(personId).success)
    return { message: "This contestant is unavailable." };
  const parsed = cashPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await eventStaffAccess(eventId, "can_collect_event");
  if (!context) return { message: "Entry access for this event is required." };

  const amountCents = Math.round(parsed.data.amount * 100);
  const { error } = await context.supabase.rpc("record_event_cash_payment", {
    target_roping_id: eventId,
    target_person_id: personId,
    payment_amount_cents: amountCents,
    payment_note: parsed.data.note,
  });
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/payouts`);
  return { success: true, message: "Cash payment recorded." };
}

export async function voidCashPayment(
  eventId: string,
  paymentId: string,
  _state: CashPaymentFormState,
  formData: FormData,
): Promise<CashPaymentFormState> {
  if (!z.uuid().safeParse(paymentId).success)
    return { message: "This payment is unavailable." };
  const parsed = voidPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: parsed.error.issues[0]?.message,
    };
  const context = await eventStaffAccess(eventId, "can_adjust_event_finances");
  if (!context) return { message: "Manager access is required." };

  const { error } = await context.supabase.rpc("void_event_cash_payment", {
    target_payment_id: paymentId,
    correction_reason: parsed.data.reason,
  });
  if (error) return { message: error.message };

  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath(`/events/${eventId}/payouts`);
  revalidatePath(`/events/${eventId}/entries/payments/${paymentId}/receipt`);
  return { success: true, message: "Payment voided and balance updated." };
}
