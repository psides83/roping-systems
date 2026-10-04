import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  return <div className="mx-auto max-w-md"><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Producer access</p><h1 className="mt-3 text-3xl font-bold">Welcome back</h1><p className="mt-3 text-sm leading-6 text-[#66716b]">Sign in to manage memberships, entries, and live roping operations.</p>{!configured ? <p className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Supabase is not connected, so authentication is in preview mode.</p> : null}<AuthForm mode="login" configured={configured} /></div>;
}
