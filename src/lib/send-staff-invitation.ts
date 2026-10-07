import "server-only";
import { createClient } from "@/lib/supabase/server";
import { staffInvitationEmail } from "./staff-invitation-email";

export async function sendStaffInvitation(id: string): Promise<string | undefined> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.STAFF_INVITATION_FROM;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!apiKey || !from || !siteUrl) return "Invitation saved. Email delivery is not configured yet.";
  const db = await createClient();
  const prepared = await db.rpc("prepare_staff_invitation_email", { target_invitation: id });
  if (prepared.error) return prepared.error.message;
  const attempt = prepared.data?.[0];
  if (!attempt) return "Unable to prepare invitation email.";
  let sent = false;
  try {
    const content = staffInvitationEmail(attempt.producer_name, attempt.staff_role, siteUrl, attempt.expires_at);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        "Idempotency-Key": `staff-invitation-${attempt.attempt_id}` },
      body: JSON.stringify({ from, to: [attempt.email], ...content }),
      signal: AbortSignal.timeout(10000),
    });
    sent = response.ok;
  } catch { sent = false; }
  const recorded = await db.rpc("finish_staff_invitation_email", { target_invitation: id,
    target_attempt: attempt.attempt_id, sent });
  if (recorded.error) return "Email attempt completed, but its status could not be saved. Check delivery before retrying.";
  return sent ? undefined : "Invitation saved, but email sending failed. You can retry from the invitation list.";
}
