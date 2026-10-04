"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";

export interface ProducerSettingsState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface ProducerLogoState {
  success?: boolean;
  message?: string;
}

export interface ProducerBrandingState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const logoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

const logoBucket = "organization-logos";

const brandingSchema = z.object({
  primary: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Enter a six-digit hex color."),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Enter a six-digit hex color."),
});

const settingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Producer name is required.")
    .transform(formatProperNoun),
  publicName: z.string().trim().transform(formatProperNoun),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  phone: z.string().trim(),
  timezone: z.enum([
    "America/Chicago",
    "America/Denver",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/New_York",
  ]),
  allowGuestEntries: z.string().optional(),
});

export async function updateProducerSettings(
  _state: ProducerSettingsState,
  formData: FormData,
): Promise<ProducerSettingsState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role))
    return { message: "Owner or administrator access is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("producers")
    .update({
      name: parsed.data.name,
      public_name: parsed.data.publicName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      timezone: parsed.data.timezone,
      allow_non_member_entries: parsed.data.allowGuestEntries === "on",
    })
    .eq("id", producer.id);
  if (error) return { message: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true, message: "Producer settings saved." };
}

export async function uploadProducerLogo(
  _state: ProducerLogoState,
  formData: FormData,
): Promise<ProducerLogoState> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role))
    return { message: "Owner or administrator access is required." };

  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0)
    return { message: "Choose a logo to upload." };
  const extension = logoTypes.get(logo.type);
  if (!extension) return { message: "Use a PNG, JPEG, or WebP image." };
  if (logo.size > 2 * 1024 * 1024)
    return { message: "Logo files must be 2 MB or smaller." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("producers")
    .select("logo_path")
    .eq("id", producer.id)
    .single();
  const path = `${producer.id}/logo-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(logoBucket)
    .upload(path, logo, { cacheControl: "3600", contentType: logo.type });
  if (uploadError) return { message: uploadError.message };

  const { error: updateError } = await supabase
    .from("producers")
    .update({ logo_path: path })
    .eq("id", producer.id);
  if (updateError) {
    await supabase.storage.from(logoBucket).remove([path]);
    return { message: updateError.message };
  }

  if (current?.logo_path && current.logo_path !== path)
    await supabase.storage.from(logoBucket).remove([current.logo_path]);
  revalidatePath("/settings");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: "Producer logo updated." };
}

export async function removeProducerLogo(
  _state: ProducerLogoState,
  _formData: FormData,
): Promise<ProducerLogoState> {
  void _state;
  void _formData;
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role))
    return { message: "Owner or administrator access is required." };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("producers")
    .select("logo_path")
    .eq("id", producer.id)
    .single();
  if (readError) return { message: readError.message };
  if (!current.logo_path)
    return { success: true, message: "No logo is currently uploaded." };

  const { error: updateError } = await supabase
    .from("producers")
    .update({ logo_path: null })
    .eq("id", producer.id);
  if (updateError) return { message: updateError.message };
  await supabase.storage.from(logoBucket).remove([current.logo_path]);
  revalidatePath("/settings");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: "Producer logo removed." };
}

export async function updateProducerBranding(
  _state: ProducerBrandingState,
  formData: FormData,
): Promise<ProducerBrandingState> {
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role))
    return { message: "Owner or administrator access is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("producers")
    .update({
      brand_primary: parsed.data.primary.toUpperCase(),
      brand_accent: parsed.data.accent.toUpperCase(),
    })
    .eq("id", producer.id);
  if (error) return { message: error.message };
  revalidatePath("/", "layout");
  revalidatePath(`/public/${producer.slug}`);
  return { success: true, message: "Producer colors updated." };
}
