import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function isPlatformOwner() {
  if (!isSupabaseConfigured()) return false;
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims) return false;
  const result = await db.rpc("is_platform_owner");
  if (result.error) throw new Error("Unable to verify platform access.");
  return result.data === true;
}
