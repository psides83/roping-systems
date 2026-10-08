"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { reviewMembershipApplication } from "@/app/(app)/settings/membership-form/actions";

export function ReviewMembershipApplication({ id, kind, membershipId, members }: {
  id: string; kind: string; membershipId: string | null; members: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(reviewMembershipApplication, {});
  const input = "mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm";
  return <form action={action} className="mt-5 flex flex-wrap items-end gap-3 border-t border-[#edf0ee] pt-4">
    <input type="hidden" name="applicationId" value={id} />
    {kind === "renewal" ? <><input type="hidden" name="membershipId" value={membershipId ?? ""} /><p className="text-xs font-semibold">Renewal · existing member record</p></> : <label className="max-w-full text-xs font-semibold">Member record<select name="membershipId" defaultValue="" className={`${input} w-56`}><option value="">Choose verified member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select><Link href="/members" target="_blank" className="mt-1 block text-xs underline">Create member first if needed</Link></label>}
    <label className="text-xs font-semibold">New expiration date<input name="expiresOn" type="date" className={`${input} w-40`} /></label>
    <label className="max-w-full text-xs font-semibold">Identity verification / review note<input name="reviewNote" maxLength={500} className={`${input} w-64`} placeholder="How was identity verified?" /></label>
    <button disabled={pending} name="status" value="declined" className="flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-xs font-bold text-rose-700 disabled:opacity-50"><X size={15} />Decline</button>
    <button disabled={pending} name="status" value="approved" className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-xs font-bold text-white disabled:opacity-50"><Check size={15} />{pending ? "Saving review..." : "Approve"}</button>
    {state.error ? <p role="alert" className="basis-full text-sm text-rose-700">{state.error}</p> : null}
  </form>;
}
