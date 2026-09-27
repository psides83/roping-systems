import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  brandPrimary: string;
  brandAccent: string;
  role: "owner" | "admin" | "operator" | "viewer";
}

export async function getOrganizations(): Promise<ActiveOrganization[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_users")
    .select("organization_id, role, organizations!inner(id, name, slug, timezone, brand_primary, brand_accent)")
    .order("created_at", { ascending: true });

  if (error || !data?.length) return [];
  return data.map((membership) => {
    const organization = membership.organizations as unknown as { id: string; name: string; slug: string; timezone: string; brand_primary: string; brand_accent: string };
    return { id: organization.id, name: organization.name, slug: organization.slug, timezone: organization.timezone, brandPrimary: organization.brand_primary, brandAccent: organization.brand_accent, role: membership.role as ActiveOrganization["role"] };
  });
}

export async function getActiveOrganization(): Promise<ActiveOrganization | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  const preferredId = cookieStore.get("active_organization_id")?.value;
  const organizations = await getOrganizations();
  if (!organizations.length) return null;

  return organizations.find((organization) => organization.id === preferredId) ?? organizations[0];
}
