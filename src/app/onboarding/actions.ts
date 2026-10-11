"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import { isVerifiedPlatformOwner } from "@/lib/platform-access";
import { sendStaffInvitation } from "@/lib/send-staff-invitation";

export interface ProducerState {
  message?: string;
  errors?: Record<string, string[]>;
}

const producerSchema = z.object({
  ownerEmail: z.string().trim().toLowerCase().email("Enter the producer owner's email."),
  name: z
    .string()
    .trim()
    .min(2, "Enter the producer name.")
    .transform(formatProperNoun),
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens only.",
    ),
});

export async function createProducer(
  _state: ProducerState,
  formData: FormData,
): Promise<ProducerState> {
  if (!await isVerifiedPlatformOwner()) return { message: "Platform owner two-factor verification is required." };
  const parsed = producerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims)
    return { message: "Your session expired. Sign in and try again." };

  const { data, error } = await supabase.rpc("provision_producer", {
    producer_name: parsed.data.name,
    producer_slug: parsed.data.slug,
    owner_email: parsed.data.ownerEmail,
  });

  if (error)
    return {
      message:
        error.code === "23505"
          ? "That public URL is already in use."
          : error.message,
    };
  const created = data?.[0];
  if (!created) return { message: "Producer setup did not return a confirmation." };
  await sendStaffInvitation(created.invitation_id);
  const cookieStore = await cookies();
  cookieStore.set("active_producer_id", created.producer_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/settings/staff");
}
