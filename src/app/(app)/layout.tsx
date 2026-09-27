import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveOrganization, getOrganizations } from "@/lib/organizations";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <AppShell demo>{children}</AppShell>;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const [organization, organizations] = await Promise.all([getActiveOrganization(), getOrganizations()]);
  if (!organization) redirect("/onboarding");

  const email = typeof data.claims.email === "string" ? data.claims.email : "Signed-in user";
  return <AppShell organizationName={organization.name} organizations={organizations.map(({ id, name }) => ({ id, name }))} activeOrganizationId={organization.id} userLabel={email} brandPrimary={organization.brandPrimary} brandAccent={organization.brandAccent}>{children}</AppShell>;
}
