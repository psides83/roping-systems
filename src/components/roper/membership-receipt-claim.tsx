"use client";
import { useActionState, useEffect, useRef } from "react";
import { Link2, LoaderCircle } from "lucide-react";
import { claimMembershipApplication } from "@/app/roper/memberships/actions";

export function MembershipReceiptClaim() {
  const [state, action, pending] = useActionState(claimMembershipApplication, {});
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    try {
      if (state.success) sessionStorage.removeItem("membership-application-receipt");
      else if (input.current) input.current.value = sessionStorage.getItem("membership-application-receipt") ?? "";
    } catch { /* Receipt codes can also be entered manually. */ }
  }, [state.success]);
  if (state.success) return <p role="status" className="border-l-2 border-emerald-500 pl-3 text-sm text-emerald-800">Application linked. Pending applications still require producer approval.</p>;
  return <details className="border-y border-[#dfe4e1] py-4"><summary className="cursor-pointer text-sm font-semibold">Link an application submitted before signing in</summary>
    <form action={action} aria-busy={pending} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block max-w-full text-xs font-semibold">Private receipt code<textarea ref={input} name="receiptCode" rows={3} maxLength={101} disabled={pending} className="mt-2 block w-80 max-w-full rounded-md border border-[#ccd4d0] p-3 font-mono text-xs" /></label>
      <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />}{pending ? "Linking..." : "Link application"}</button>
      <p className="basis-full text-xs text-[#66716b]">Use the confirmed sign-in email you provided on the application. Without a receipt or matching email, contact the producer for identity verification.</p>
      {state.error && <p role="alert" className="basis-full text-sm text-rose-700">{state.error}</p>}
    </form>
  </details>;
}
