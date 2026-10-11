"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPlatformOwner } from "@/lib/platform-access";
import { createClient } from "@/lib/supabase/server";
import { accountStatuses, onboardingTasks } from "@/lib/platform-admin";
import { formatProperNoun } from "@/lib/utils";
import { sendStaffInvitation } from "@/lib/send-staff-invitation";

export interface PlatformFormState { success?: boolean; message?: string }
const email = z.union([z.literal(""), z.email()]);
const phone = z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => !value || value.length === 10, "Enter a ten-digit phone number.");
const operations = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("account"), producerName: z.string().trim().min(2).max(120).transform(formatProperNoun), expectedProducerUpdatedAt: z.iso.datetime({ offset: true }), status: z.enum(Object.keys(accountStatuses) as [keyof typeof accountStatuses, ...Array<keyof typeof accountStatuses>]), nextAction: z.string().trim().max(300), followUpOn: z.union([z.literal(""), z.iso.date()]), reason: z.string().trim().max(1000), expectedUpdatedAt: z.iso.datetime({ offset: true }) }),
  z.object({ operation: z.literal("contact"), id: z.union([z.literal(""), z.uuid()]), name: z.string().trim().min(1).max(120).transform(formatProperNoun), email, phone, responsibility: z.string().trim().max(120), isPrimary: z.boolean() }).refine((value) => Boolean(value.email || value.phone), "Provide an email or phone number."),
  z.object({ operation: z.literal("archive_contact"), id: z.uuid(), reason: z.string().trim().min(5).max(1000) }),
  z.object({ operation: z.literal("task"), key: z.enum(Object.keys(onboardingTasks) as [keyof typeof onboardingTasks, ...Array<keyof typeof onboardingTasks>]), done: z.boolean() }),
  z.object({ operation: z.literal("note"), body: z.string().trim().min(1).max(5000) }),
]);

export async function managePlatformProducer(id: string, _state: PlatformFormState, formData: FormData): Promise<PlatformFormState> {
  if (!await isPlatformOwner()) return { message: "Platform owner access is required." };
  if (!z.uuid().safeParse(id).success) return { message: "Producer account not found." };
  const parsed = operations.safeParse({ ...Object.fromEntries(formData), isPrimary: formData.get("isPrimary") === "on", done: formData.get("done") === "true" });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const db = await createClient();
  const { operation, ...payload } = parsed.data;
  const { error } = await db.rpc("manage_platform_producer", { target_producer: id, operation, payload: { ...payload, confirmed: formData.get("confirmed") === "on" } });
  if (error) return { message: error.message };
  revalidatePath("/platform");
  revalidatePath(`/platform/producers/${id}`);
  revalidatePath("/dashboard", "layout");
  return { success: true, message: "Saved." };
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120).transform(formatProperNoun),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  ownerEmail: z.email().transform((value) => value.toLowerCase()),
  contactName: z.string().trim().min(1).max(120).transform(formatProperNoun),
  contactPhone: phone, status: z.enum(["pending", "setup"]),
});
export async function createPlatformProducer(_state: PlatformFormState, formData: FormData): Promise<PlatformFormState> {
  if (!await isPlatformOwner()) return { message: "Platform owner access is required." };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const db = await createClient();
  const { data, error } = await db.rpc("provision_platform_producer", {
    producer_name: parsed.data.name, producer_slug: parsed.data.slug, owner_email: parsed.data.ownerEmail,
    contact_name: parsed.data.contactName, contact_phone: parsed.data.contactPhone, initial_status: parsed.data.status,
  });
  if (error) return { message: error.code === "23505" ? "That public page address is already in use." : error.message };
  const created = data?.[0];
  if (!created) return { message: "Producer creation did not return a confirmation." };
  if (parsed.data.status === "setup") await sendStaffInvitation(created.invitation_id);
  revalidatePath("/platform");
  redirect(`/platform/producers/${created.producer_id}?tab=contacts`);
}
