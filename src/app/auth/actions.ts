"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatProperNoun } from "@/lib/utils";
import { authDestination } from "@/lib/auth-destination";
import { isPlatformOwner } from "@/lib/platform-access";

export interface AuthState {
  message?: string;
  errors?: Record<string, string[]>;
}

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must contain at least 8 characters."),
});

const signupSchema = loginSchema.extend({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .transform(formatProperNoun),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .transform(formatProperNoun),
});

export async function login(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured())
    return {
      message: "Supabase is not connected yet. Use preview mode instead.",
    };
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: error.message };
  if (authDestination(formData.get("next")) === "/platform" && await isPlatformOwner()) redirect("/platform");
  if (authDestination(formData.get("next")) === "/staff-invitations") redirect("/staff-invitations");
  const invitations = await supabase.rpc("my_staff_invitations");
  if (invitations.data?.length) redirect("/staff-invitations");
  redirect("/dashboard");
}

export async function signup(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured())
    return {
      message: "Supabase is not connected yet. Use preview mode instead.",
    };
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(authDestination(formData.get("next")))}`,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
      },
    },
  });

  if (error) return { message: error.message };
  if (data.session) redirect(authDestination(formData.get("next")));
  return {
    message:
      authDestination(formData.get("next")) === "/staff-invitations"
        ? "Check your email to confirm your account and continue to your staff invitation. If the confirmation opens elsewhere, return to the invitation link and sign in."
        : "Check your email to confirm your account, then return here to sign in.",
  };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/auth/login");
}
