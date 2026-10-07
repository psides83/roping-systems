"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { sendStaffInvitation } from "@/lib/send-staff-invitation";
export interface StaffActionState { error?: string; success?: boolean; warning?: string }
export async function manageStaff(_: StaffActionState, form: FormData): Promise<StaffActionState> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Staff management requires an owner or administrator." };
  const db = await createClient();
  const role = form.get("role");
  const validRole = z.enum(["owner", "admin", "operator", "viewer"]).safeParse(role);
  const operation = form.get("operation");
  let result;
  if (operation === "invite") {
    const email = z.email().safeParse(form.get("email"));
    if (!email.success || !validRole.success) return { error: "Choose a valid email and role." };
    result = await db.rpc("invite_producer_staff", { target_producer: producer.id, target_email: email.data, target_role: validRole.data });
  } else {
    const id = z.uuid().safeParse(form.get("id"));
    if (!id.success) return { error: "Invalid staff record." };
    if (operation === "send") {
      const warning = await sendStaffInvitation(id.data);
      revalidatePath("/settings/staff");
      return { success: !warning, warning };
    }
    if (operation === "cancel") result = await db.rpc("cancel_staff_invitation", { target_invitation: id.data });
    else if (operation === "remove" || operation === "role") {
      if (operation === "role" && !validRole.success) return { error: "Choose a valid role." };
      result = await db.rpc("manage_producer_staff", { target_producer: producer.id, target_user: id.data,
        target_role: operation === "remove" ? null : validRole.data });
    } else return { error: "Unknown staff action." };
  }
  if (result.error) return { error: result.error.message };
  const warning = operation === "invite" ? await sendStaffInvitation(result.data as string) : undefined;
  revalidatePath("/settings"); revalidatePath("/settings/staff");
  return { success: true, warning };
}
