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

const existingEntrySchema = z.object({
  divisionId: z.uuid(),
  personId: z.uuid(),
  paymentStatus: z.enum(["unpaid", "paid_cash", "comped"]),
});

const guestEntrySchema = z.object({
  divisionId: z.uuid(),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  phone: z.string().trim(),
  paymentStatus: z.enum(["unpaid", "paid_cash", "comped"]),
});

async function requireManager() {
  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return null;
  return { organization, supabase: await createClient() };
}

export async function addExistingEntry(ropingId: string, _state: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const parsed = existingEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };
  const { error } = await context.supabase.rpc("create_event_entry", { target_roping_division_id: parsed.data.divisionId, target_person_id: parsed.data.personId, entry_origin: "office", initial_payment_status: parsed.data.paymentStatus });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return { success: true, message: "Entry added and fees calculated." };
}

export async function addGuestEntry(ropingId: string, _state: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const parsed = guestEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await requireManager();
  if (!context) return { message: "Manager access is required." };
  const { error } = await context.supabase.rpc("create_guest_event_entry", { target_roping_division_id: parsed.data.divisionId, guest_first_name: parsed.data.firstName, guest_last_name: parsed.data.lastName, guest_email: parsed.data.email, guest_phone: parsed.data.phone, initial_payment_status: parsed.data.paymentStatus });
  if (error) return { message: error.message };
  revalidatePath(`/ropings/${ropingId}/entries`);
  revalidatePath(`/ropings/${ropingId}/live`);
  return { success: true, message: "Guest entry added and fees calculated." };
}
