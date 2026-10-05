import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveProducer, getProducers } from "@/lib/producers";
import { Suspense } from "react";
import { AppBootSkeleton } from "@/components/ui/page-skeleton";
import { EntryLabelProvider } from "@/components/events/entry-label";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<AppBootSkeleton />}><AuthenticatedShell>{children}</AuthenticatedShell></Suspense>;
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <AppShell demo>{children}</AppShell>;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");

  const [producer, producers] = await Promise.all([getActiveProducer(), getProducers()]);
  if (!producer) {
    const { data: memberships } = await supabase.rpc("my_memberships");
    redirect(memberships?.length ? "/roper" : "/onboarding");
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : "Signed-in user";
  return <EntryLabelProvider style={producer.entryLabelStyle}><AppShell producerName={producer.name} producers={producers.map(({ id, name }) => ({ id, name }))} activeProducerId={producer.id} userLabel={email} brandPrimary={producer.brandPrimary} brandAccent={producer.brandAccent}>{children}</AppShell></EntryLabelProvider>;
}
