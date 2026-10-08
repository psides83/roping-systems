"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  getStandardMembershipField,
  type CustomMembershipSection,
  type SelectedMembershipField,
} from "@/lib/membership-forms";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneNumber, formatProperNoun } from "@/lib/utils";

export interface MembershipApplicationState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string>;
  receiptCode?: string;
}

const identityFields = new Set([
  "first_name",
  "last_name",
  "city",
  "state",
  "completer_name",
]);

function cleanResponse(key: string, value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  if (identityFields.has(key)) return formatProperNoun(text);
  if (key === "phone" || key === "secondary_phone")
    return formatPhoneNumber(text);
  return text;
}

export async function submitMembershipApplication(
  _state: MembershipApplicationState,
  formData: FormData,
): Promise<MembershipApplicationState> {
  const formId = z.uuid().safeParse(formData.get("formId"));
  if (!formId.success)
    return { message: "This membership form is unavailable." };

  const supabase = await createClient();
  const { data: form, error: formError } = await supabase
    .from("public_membership_forms")
    .select(
      "id, standard_fields, custom_sections, release_text, require_signature",
    )
    .eq("id", formId.data)
    .maybeSingle();
  if (formError || !form) {
    return { message: "This membership form is no longer available." };
  }

  const standardFields =
    form.standard_fields as unknown as SelectedMembershipField[];
  const customSections =
    form.custom_sections as unknown as CustomMembershipSection[];
  const responses: Record<string, string | boolean> = {};
  const errors: Record<string, string> = {};

  for (const selected of standardFields) {
    const definition = getStandardMembershipField(selected.key);
    if (!definition) continue;
    const value = cleanResponse(
      selected.key,
      formData.get(`standard_${selected.key}`),
    );
    if (selected.required && !value)
      errors[`standard_${selected.key}`] = "Required";
    if (
      definition.type === "email" &&
      value &&
      !z.email().safeParse(value).success
    ) {
      errors[`standard_${selected.key}`] = "Enter a valid email address";
    }
    responses[selected.key] = value;
  }

  for (const section of customSections) {
    for (const field of section.fields) {
      const key = `custom_${field.id}`;
      if (field.type === "checkbox") {
        const checked = formData.get(key) === "on";
        if (field.required && !checked) errors[key] = "Required";
        responses[key] = checked;
      } else {
        const value = cleanResponse(key, formData.get(key));
        if (field.required && !value) errors[key] = "Required";
        responses[key] = value;
      }
    }
  }

  const acceptedRelease = formData.get("acceptedRelease") === "on";
  const signatureName = cleanResponse(
    "completer_name",
    formData.get("signatureName"),
  );
  if (form.release_text && !acceptedRelease)
    errors.acceptedRelease = "Required";
  if (form.require_signature && !signatureName)
    errors.signatureName = "Required";
  if (Object.keys(errors).length) {
    return { message: "Complete the required fields.", errors };
  }

  const memberId = formData.get("membershipId");
  if (memberId && !z.uuid().safeParse(memberId).success) return { message: "Check the renewal membership." };
  const { data, error } = await supabase.rpc(memberId ? "submit_membership_renewal" : "submit_membership_application_with_receipt", {
    target_form_id: form.id,
    application_responses: responses,
    accepted_release: acceptedRelease,
    entered_signature_name: signatureName || null,
    ...(memberId ? { target_membership_id: memberId } : {}),
  });
  if (error) return { message: error.message };
  revalidatePath("/roper/memberships");
  revalidatePath("/settings/membership-form");
  return {
    success: true,
    message: "Your membership application has been submitted.",
    receiptCode: !memberId ? (data as { receiptCode?: string | null })?.receiptCode ?? undefined : undefined,
  };
}
