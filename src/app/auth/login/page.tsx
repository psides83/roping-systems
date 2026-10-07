import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authDestination } from "@/lib/auth-destination";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = authDestination((await searchParams).next);
  const configured = isSupabaseConfigured();
  return <div className="mx-auto max-w-md"><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">{next === "/staff-invitations" ? "Staff invitation" : "Producer access"}</p><h1 className="mt-3 text-3xl font-bold">Welcome back</h1><p className="mt-3 text-sm leading-6 text-[#66716b]">{next === "/staff-invitations" ? "Sign in with the email address your producer invited." : "Sign in to manage memberships, entries, and live roping operations."}</p>{!configured ? <p className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Supabase is not connected, so authentication is in preview mode.</p> : null}<AuthForm mode="login" configured={configured} next={next} /></div>;
}
