import { PersistentForm } from "@/components/ui/persistent-form";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveProducer, getProducers } from "@/lib/producers";
import { Suspense } from "react";
import { AppBootSkeleton } from "@/components/ui/page-skeleton";
import { EntryLabelProvider } from "@/components/events/entry-label";
import { isPlatformOwner } from "@/lib/platform-access";
import { ProducerFeaturesProvider } from "@/components/settings/producer-features-context";
import { getProducerFeatures } from "@/lib/producer-features-server";
import Link from "next/link";
import { accountAvailable, accountStatuses } from "@/lib/platform-admin";
import { signOut } from "@/app/auth/actions";
import { switchProducer } from "@/app/actions/producers";

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
    if (await isPlatformOwner()) redirect("/platform");
    const { data: memberships } = await supabase.rpc("my_memberships");
    redirect(memberships?.length ? "/roper" : "/onboarding");
  }
  if (producer.accountStatus && !accountAvailable(producer.accountStatus)) {
    return <main className="mx-auto max-w-lg space-y-5 px-5 py-12"><h1 className="text-2xl font-bold">{producer.name}</h1><p className="font-semibold">{accountStatuses[producer.accountStatus]}</p><p className="text-sm leading-6 text-[#66716b]">This producer workspace is not currently available. Your login remains valid and account records are retained. Contact platform support for assistance.</p><div className="space-y-2">{producers.filter((item) => item.accountStatus && accountAvailable(item.accountStatus)).map((item) => <PersistentForm key={item.id} action={switchProducer}><input type="hidden" name="producerId" value={item.id} /><input type="hidden" name="returnTo" value="/dashboard" /><button className="text-sm font-semibold underline">Open {item.name}</button></PersistentForm>)}</div><div className="flex flex-wrap gap-4">{await isPlatformOwner() && <Link href="/platform" className="font-semibold underline">Platform Admin</Link>}<Link href="/roper" className="font-semibold underline">Roper portal</Link><PersistentForm action={signOut}><button className="font-semibold underline">Sign out</button></PersistentForm></div></main>;
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : "Signed-in user";
  const features = await getProducerFeatures(producer.id);
  return <ProducerFeaturesProvider features={features}><EntryLabelProvider style={producer.entryLabelStyle}><AppShell platformOwner={await isPlatformOwner()} producerName={producer.name} producers={producers.map(({ id, name }) => ({ id, name }))} activeProducerId={producer.id} userLabel={email} brandPrimary={producer.brandPrimary} brandAccent={producer.brandAccent}>{children}</AppShell></EntryLabelProvider></ProducerFeaturesProvider>;
}
