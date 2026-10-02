"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface MemberFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const memberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  phone: z.string().trim(),
  birthDate: z.union([z.literal(""), z.iso.date()]),
  competitionGender: z.enum(["female", "male"], {
    message: "Select a competition gender.",
  }),
  memberNumber: z.string().trim().min(1, "Member number is required."),
  status: z.enum(["active", "pending", "expired", "inactive"]),
});

export async function addMember(
  _state: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  if (!isSupabaseConfigured())
    return { message: "Connect Supabase before adding live records." };
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const classificationIds = formData
    .getAll("classificationIds")
    .map(String)
    .filter(Boolean);
  if (classificationIds.some((value) => !z.uuid().safeParse(value).success))
    return { message: "Choose valid starting classifications." };

  const organization = await getActiveOrganization();
  if (!organization || organization.role === "viewer")
    return { message: "You do not have permission to add members." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_member_v2", {
    target_organization_id: organization.id,
    member_first_name: parsed.data.firstName,
    member_last_name: parsed.data.lastName,
    member_email: parsed.data.email,
    member_phone: parsed.data.phone,
    member_birth_date: parsed.data.birthDate || null,
    member_competition_gender: parsed.data.competitionGender,
    member_classification_ids: classificationIds,
    new_member_number: parsed.data.memberNumber,
    new_status: parsed.data.status,
  });

  if (error) {
    if (error.code === "23505")
      return {
        message:
          "That person or member number already belongs to this organization.",
      };
    return { message: error.message };
  }

  revalidatePath("/members");
  return { success: true, message: "Member added successfully." };
}
