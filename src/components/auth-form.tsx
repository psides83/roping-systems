"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { login, signup, type AuthState } from "@/app/auth/actions";

const initialState: AuthState = {};

function FieldError({ messages }: { messages?: string[] }) {
  return messages?.length ? <p className="mt-1.5 text-xs font-medium text-rose-700">{messages[0]}</p> : null;
}

export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-7 space-y-4">
      {mode === "signup" ? <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">First name<input name="firstName" autoComplete="given-name" className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]" required /></label><label className="block text-sm font-semibold">Last name<input name="lastName" autoComplete="family-name" className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]" required /></label><div className="sm:col-span-1"><FieldError messages={state.errors?.firstName} /></div><div className="sm:col-span-1"><FieldError messages={state.errors?.lastName} /></div></div> : null}
      <label className="block text-sm font-semibold">Email address<input name="email" type="email" autoComplete="email" className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]" placeholder="you@example.com" required /></label>
      <FieldError messages={state.errors?.email} />
      <label className="block text-sm font-semibold">Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]" required /></label>
      <FieldError messages={state.errors?.password} />
      {state.message ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">{state.message}</p> : null}
      <button disabled={pending || !configured} className="flex h-12 w-full items-center justify-center gap-2 rounded-md brand-accent-fill text-sm font-bold text-white enabled:hover:bg-[var(--brand-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50">{pending ? <LoaderCircle size={17} className="animate-spin" /> : null}{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={17} /></button>
      {!configured ? <Link href="/dashboard" className="flex h-11 w-full items-center justify-center rounded-md border border-[#ccd4d0] text-sm font-semibold text-[#334139] hover:bg-[#f5f6f5]">Continue in preview mode</Link> : null}
      <p className="pt-1 text-center text-sm text-[#66716b]">{mode === "login" ? "New to Roping Systems?" : "Already have an account?"} <Link href={mode === "login" ? "/auth/signup" : "/auth/login"} className="font-bold text-[var(--brand-accent-strong)]">{mode === "login" ? "Create an account" : "Sign in"}</Link></p>
    </form>
  );
}
