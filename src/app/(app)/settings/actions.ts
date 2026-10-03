"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";

export interface OrganizationSettingsState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface OrganizationLogoState {
  success?: boolean;
  message?: string;
}

export interface OrganizationBrandingState {
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
    .min(2, "Organization name is required.")
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

export async function updateOrganizationSettings(
  _state: OrganizationSettingsState,
  formData: FormData,
): Promise<OrganizationSettingsState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const organization = await getActiveOrganization();
  if (!organization || !["owner", "admin"].includes(organization.role))
    return { message: "Owner or administrator access is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      public_name: parsed.data.publicName || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      timezone: parsed.data.timezone,
      allow_guest_entries: parsed.data.allowGuestEntries === "on",
    })
    .eq("id", organization.id);
  if (error) return { message: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true, message: "Organization settings saved." };
}

export async function uploadOrganizationLogo(
  _state: OrganizationLogoState,
  formData: FormData,
): Promise<OrganizationLogoState> {
  const organization = await getActiveOrganization();
  if (!organization || !["owner", "admin"].includes(organization.role))
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
    .from("organizations")
    .select("logo_path")
    .eq("id", organization.id)
    .single();
  const path = `${organization.id}/logo-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(logoBucket)
    .upload(path, logo, { cacheControl: "3600", contentType: logo.type });
  if (uploadError) return { message: uploadError.message };

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_path: path })
    .eq("id", organization.id);
  if (updateError) {
    await supabase.storage.from(logoBucket).remove([path]);
    return { message: updateError.message };
  }

  if (current?.logo_path && current.logo_path !== path)
    await supabase.storage.from(logoBucket).remove([current.logo_path]);
  revalidatePath("/settings");
  revalidatePath(`/public/${organization.slug}`);
  return { success: true, message: "Organization logo updated." };
}

export async function removeOrganizationLogo(
  _state: OrganizationLogoState,
  _formData: FormData,
): Promise<OrganizationLogoState> {
  void _state;
  void _formData;
  const organization = await getActiveOrganization();
  if (!organization || !["owner", "admin"].includes(organization.role))
    return { message: "Owner or administrator access is required." };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("organizations")
    .select("logo_path")
    .eq("id", organization.id)
    .single();
  if (readError) return { message: readError.message };
  if (!current.logo_path)
    return { success: true, message: "No logo is currently uploaded." };

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_path: null })
    .eq("id", organization.id);
  if (updateError) return { message: updateError.message };
  await supabase.storage.from(logoBucket).remove([current.logo_path]);
  revalidatePath("/settings");
  revalidatePath(`/public/${organization.slug}`);
  return { success: true, message: "Organization logo removed." };
}

export async function updateOrganizationBranding(
  _state: OrganizationBrandingState,
  formData: FormData,
): Promise<OrganizationBrandingState> {
  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const organization = await getActiveOrganization();
  if (!organization || !["owner", "admin"].includes(organization.role))
    return { message: "Owner or administrator access is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      brand_primary: parsed.data.primary.toUpperCase(),
      brand_accent: parsed.data.accent.toUpperCase(),
    })
    .eq("id", organization.id);
  if (error) return { message: error.message };
  revalidatePath("/", "layout");
  revalidatePath(`/public/${organization.slug}`);
  return { success: true, message: "Organization colors updated." };
}
