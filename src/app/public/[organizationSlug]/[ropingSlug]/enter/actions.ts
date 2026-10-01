"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface OnlineEntryFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const onlineEntrySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(40, "Phone number is too long."),
  birthDate: z.union([z.literal(""), z.iso.date()]),
  memberNumber: z.string().trim().max(50, "Member number is too long."),
  note: z.string().trim().max(500, "Keep the note under 500 characters."),
  website: z.string().max(0),
});

export async function submitOnlineEntry(
  organizationSlug: string,
  ropingSlug: string,
  _state: OnlineEntryFormState,
  formData: FormData,
): Promise<OnlineEntryFormState> {
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
  const { error } = await supabase.rpc("submit_online_entry_request_v2", {
    target_organization_slug: organizationSlug,
    target_roping_slug: ropingSlug,
    contestant_first_name: parsed.data.firstName,
    contestant_last_name: parsed.data.lastName,
    contestant_email: parsed.data.email,
    contestant_phone: parsed.data.phone,
    contestant_birth_date: parsed.data.birthDate || null,
    contestant_member_number: parsed.data.memberNumber,
    contestant_note: parsed.data.note,
    requested_divisions: requestedDivisions,
  });

  if (error) return { message: error.message };
  return {
    success: true,
    message:
      "Your entry request was received. The organization will review it before adding it to the draw.",
  };
}
