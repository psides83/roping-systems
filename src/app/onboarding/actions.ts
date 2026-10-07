"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import { isPlatformOwner } from "@/lib/platform-access";

export interface ProducerState {
  message?: string;
  errors?: Record<string, string[]>;
}

const producerSchema = z.object({
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
  if (!await isPlatformOwner()) return { message: "Only the platform owner can create producers." };
  const parsed = producerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims)
    return { message: "Your session expired. Sign in and try again." };

  const { data, error } = await supabase.rpc("create_organization", {
    organization_name: parsed.data.name,
    organization_slug: parsed.data.slug,
  });

  if (error)
    return {
      message:
        error.code === "23505"
          ? "That public URL is already in use."
          : error.message,
    };
  const cookieStore = await cookies();
  cookieStore.set("active_producer_id", data as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/dashboard");
}
