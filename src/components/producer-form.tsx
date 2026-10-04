"use client";

import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createProducer, type ProducerState } from "@/app/onboarding/actions";

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ProducerForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [state, action, pending] = useActionState<ProducerState, FormData>(createProducer, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block text-sm font-semibold">Producer name<input name="name" value={name} onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(toSlug(event.target.value)); }} className="mt-2 h-11 w-full rounded-md border border-[#ccd4d0] px-3 outline-none focus:border-[var(--brand-accent)]" placeholder="Red River Calf Ropers" required /></label>
      {state.errors?.name ? <p className="text-xs font-medium text-rose-700">{state.errors.name[0]}</p> : null}
      <label className="block text-sm font-semibold">Public page address<div className="mt-2 flex h-11 items-center rounded-md border border-[#ccd4d0] bg-white px-3 focus-within:border-[var(--brand-accent)]"><span className="text-sm text-[#8a938e]">/public/</span><input name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(toSlug(event.target.value)); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="red-river-calf-ropers" required /></div></label>
      {state.errors?.slug ? <p className="text-xs font-medium text-rose-700">{state.errors.slug[0]}</p> : null}
      {state.message ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{state.message}</p> : null}
      <button disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-md brand-accent-fill text-sm font-bold text-white hover:bg-[var(--brand-accent-strong)] disabled:opacity-50">{pending ? <LoaderCircle size={17} className="animate-spin" /> : null}Create producer <ArrowRight size={17} /></button>
    </form>
  );
}
