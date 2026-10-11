import "server-only";
import { redirect } from "next/navigation";
import { isPlatformOwner, isVerifiedPlatformOwner } from "@/lib/platform-access";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PlatformDetail } from "@/lib/platform-admin";

export async function platformAdminClient() {
  if (!isSupabaseConfigured()) redirect("/auth/login");
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=%2Fplatform");
  if (!await isPlatformOwner()) redirect("/dashboard");
  if (!await isVerifiedPlatformOwner()) redirect("/auth/platform-security");
  return db;
}

export async function readPlatformProducer(id: string): Promise<PlatformDetail | null> {
  const db = await platformAdminClient();
  const { data, error } = await db.rpc("platform_producer_detail", { target_producer: id });
  if (error) throw new Error("Unable to load producer account.");
  if (!data) return null;
  const detail = data as PlatformDetail;
  const readAt = Date.now();
  return { ...detail, invitations: detail.invitations.map((invitation) => ({ ...invitation, expired: new Date(invitation.expires_at).getTime() <= readAt })) };
}
