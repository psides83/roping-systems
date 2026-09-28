"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface RopingFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a valid date and time.");
const ropingSchema = z.object({
  title: z.string().trim().min(2, "Event title is required."),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  venueName: z.string().trim(),
  address: z.string().trim(),
  startsAt: localDateTime,
  entriesOpenAt: z.union([z.literal(""), localDateTime]),
  entriesCloseAt: z.union([z.literal(""), localDateTime]),
  isPublic: z.string().optional(),
});

export async function createRoping(_state: RopingFormState, formData: FormData): Promise<RopingFormState> {
  if (!isSupabaseConfigured()) return { message: "Connect Supabase before creating live events." };
  const parsed = ropingSchema.safeParse(Object.fromEntries(formData));
  const divisionIds = formData.getAll("divisionIds").map(String);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (!divisionIds.length) return { errors: { divisionIds: ["Select at least one entry class."] } };

  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer") return { message: "You do not have permission to create events." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_roping_from_templates", {
    target_organization_id: organization.id,
    event_title: parsed.data.title,
    event_slug: parsed.data.slug,
    event_venue_name: parsed.data.venueName,
    event_address: parsed.data.address,
    event_starts_at_local: parsed.data.startsAt,
    event_entries_open_at_local: parsed.data.entriesOpenAt || null,
    event_entries_close_at_local: parsed.data.entriesCloseAt || null,
    event_is_public: parsed.data.isPublic === "on",
    selected_division_template_ids: divisionIds,
  });

  if (error) return { message: error.code === "23505" ? "An event already uses that public URL." : error.message };
  revalidatePath("/ropings");
  return { success: true, message: "Roping created with its entry classes and fees." };
}
