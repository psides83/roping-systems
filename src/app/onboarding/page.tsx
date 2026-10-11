import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { isPlatformOwner } from "@/lib/platform-access";

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  if (!await isPlatformOwner()) redirect("/staff-invitations");
  redirect("/platform/producers/new");
}
