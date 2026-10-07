import { AuthForm } from "@/components/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { authDestination } from "@/lib/auth-destination";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = authDestination((await searchParams).next);
  const staff = next === "/staff-invitations";
  const configured = isSupabaseConfigured();
  return <div className="mx-auto max-w-md"><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">{staff ? "Staff invitation" : "Roper registration"}</p><h1 className="mt-3 text-3xl font-bold">{staff ? "Create your account" : "Create your roper account"}</h1><p className="mt-3 text-sm leading-6 text-[#66716b]">{staff ? "Use the email address your producer invited. Verify your email to continue to your staff invitation." : "Your login can be used across producers you belong to. Producer administration requires an invitation."}</p><AuthForm mode="signup" configured={configured} next={next} /></div>;
}
