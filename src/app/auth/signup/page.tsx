import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function SignupPage() {
  const configured = isSupabaseConfigured();
  return <div className="mx-auto max-w-md"><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Create your account</p><h1 className="mt-3 text-3xl font-bold">Get your producer started</h1><p className="mt-3 text-sm leading-6 text-[#66716b]">Your login and contact profile can be used across every producer you belong to.</p><AuthForm mode="signup" configured={configured} /></div>;
}
