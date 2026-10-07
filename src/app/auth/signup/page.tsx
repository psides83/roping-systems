import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function SignupPage() {
  const configured = isSupabaseConfigured();
  return <div className="mx-auto max-w-md"><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">Roper registration</p><h1 className="mt-3 text-3xl font-bold">Create your roper account</h1><p className="mt-3 text-sm leading-6 text-[#66716b]">Your login can be used across producers you belong to. Producer administration requires an invitation.</p><AuthForm mode="signup" configured={configured} /></div>;
}
