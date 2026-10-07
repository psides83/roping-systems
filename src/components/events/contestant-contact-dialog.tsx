"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Pencil, X } from "lucide-react";
import { correctContestantContact } from "@/app/(app)/events/[eventId]/entries/actions";
import { PhoneInput } from "@/components/ui/phone-input";

export function ContestantContactDialog({ eventId, roperId, email, phone }: { eventId: string; roperId: string; email: string | null; phone: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(correctContestantContact.bind(null, eventId, roperId), {});
  useEffect(() => {
    if (!state.success) return;
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [state]);
  const input = "mt-1 h-10 w-full rounded-md border border-[#ccd4d0] px-3 text-sm";
  return <>
    <button type="button" onClick={() => setOpen(true)} title="Correct contact details" aria-label="Correct contact details" className="mt-2 grid h-8 w-8 place-items-center rounded-md border border-[#ccd4d0] hover:bg-[#f0f2f1]"><Pencil size={14} /></button>
    {open ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4">
      <button aria-label="Close contact dialog" className="absolute inset-0" onClick={() => setOpen(false)} />
      <section role="dialog" aria-modal="true" aria-labelledby={`contact-${roperId}`} className="relative w-full max-w-md rounded-md bg-white p-5 shadow-xl">
        <header className="flex items-center justify-between"><h2 id={`contact-${roperId}`} className="text-lg font-bold">Correct contact details</h2><button aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center"><X size={18} /></button></header>
        <p className="mt-2 text-xs text-[#66716b]">Updates the roper’s shared contact record, not their sign-in email.</p>
        <form action={action} className="mt-4 space-y-3">
          <label className="block text-sm font-semibold">Email<input name="email" type="email" defaultValue={email ?? ""} className={input} /></label>
          <label className="block text-sm font-semibold">Phone<PhoneInput defaultValue={phone ?? ""} className={input} /></label>
          <label className="block text-sm font-semibold">Correction reason<input name="reason" minLength={5} maxLength={300} required className={input} /></label>
          {state.message ? <p role="status" className="text-sm text-rose-700">{state.message}</p> : null}
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-md border px-3 text-sm font-semibold">Cancel</button><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-bold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}Save</button></div>
        </form>
      </section>
    </div> : null}
  </>;
}
