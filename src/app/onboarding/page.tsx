import { redirect } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { ProducerForm } from "@/components/producer-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { isPlatformOwner } from "@/lib/platform-access";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  if (!await isPlatformOwner()) return <main className="mx-auto max-w-xl px-5 py-12"><h1 className="text-2xl font-bold">Producer invitation required</h1><p className="mt-3 text-sm text-[#66716b]">Producer accounts are created by the platform owner. Contact your producer for staff access.</p></main>;
  const { new: createAnother } = await searchParams;
  if (await getActiveProducer() && createAnother !== "1") redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[#f5f6f7] px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl"><div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-md brand-primary-fill text-white"><Building2 size={22} /></span><p className="mt-6 text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Producer setup</p><h1 className="mt-3 text-3xl font-bold">Create your producer</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#66716b]">This becomes the private workspace for your members, events, entries, and results.</p></div><section className="mt-8 rounded-md border border-[#dfe4e1] bg-white p-6 sm:p-8"><div className="grid gap-3 border-b border-[#e7ebe8] pb-6 text-sm text-[#526058] sm:grid-cols-3"><span className="flex items-center gap-2"><Check size={15} className="text-emerald-600" /> Invite staff later</span><span className="flex items-center gap-2"><Check size={15} className="text-emerald-600" /> Add custom divisions</span><span className="flex items-center gap-2"><Check size={15} className="text-emerald-600" /> Public results page</span></div><ProducerForm /></section></div>
    </main>
  );
}
