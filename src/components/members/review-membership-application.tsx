"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { reviewMembershipApplication } from "@/app/(app)/settings/membership-form/actions";
import { PhoneInput } from "@/components/ui/phone-input";

export function ReviewMembershipApplication({ id, kind, membershipId, members, responses = {}, divisions = [] }: {
  id: string; kind: string; membershipId: string | null; members: { id: string; label: string }[];
  responses?: Record<string, unknown>; divisions?: { id: string; name: string; classifications: { id: string; name: string }[] }[];
}) {
  const [state, action, pending] = useActionState(reviewMembershipApplication, {});
  const [mode, setMode] = useState(kind === "renewal" ? "existing" : "new");
  const value = (key: string) => typeof responses[key] === "string" ? responses[key] as string : "";
  const input = "mt-2 block h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm";
  if (state.success) return <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">Review saved.{state.membershipId && <Link href={`/members/${state.membershipId}`} className="ml-2 underline">View member</Link>}</p>;
  return <PersistentForm action={action} className="mt-5 space-y-4 border-t border-[#edf0ee] pt-4" aria-busy={pending}>
    <input type="hidden" name="applicationId" value={id} />
    <fieldset disabled={pending} className="space-y-4">
      {kind === "renewal" ? <><input type="hidden" name="membershipId" value={membershipId ?? ""} /><p className="text-xs font-semibold">Renewal · existing member record</p></> : <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Member record<select name="recordMode" value={mode} onChange={(e) => setMode(e.target.value)} className={input}><option value="new">Create new member</option><option value="existing">Use existing member</option></select></label>
        {mode === "existing" && <label className="text-xs font-semibold">Verified member<select name="membershipId" defaultValue="" className={input}><option value="">Choose verified member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>}
      </div>}
      {kind !== "renewal" && mode === "new" && <div className="flex flex-wrap gap-4">
        {[["firstName", "First name", "first_name", "text"], ["lastName", "Last name", "last_name", "text"], ["memberNumber", "Member number", "member_number", "text"], ["email", "Email", "email", "email"], ["birthDate", "Birth date", "birth_date", "date"]].map(([name, label, key, type]) => <label key={name} className="text-xs font-semibold">{label}<input name={name} type={type} defaultValue={value(key)} className={input} /></label>)}
        <label className="text-xs font-semibold">Phone<PhoneInput name="phone" defaultValue={value("phone")} className={input} /></label>
        <label className="text-xs font-semibold">Competition gender<select name="gender" defaultValue={value("competition_gender").toLowerCase()} className={input}><option value="">Select gender</option><option value="female">Female</option><option value="male">Male</option></select></label>
        {divisions.map((d) => <label key={d.id} className="text-xs font-semibold">{d.name} classification<select name="classificationIds" defaultValue="" className={input}><option value="">Unclassified</option>{d.classifications.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>)}
      </div>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">New expiration date<input name="expiresOn" type="date" className={input} /></label>
        <label className="text-xs font-semibold">Identity verification / review note<input name="reviewNote" maxLength={500} className={input} placeholder="How was identity verified?" /></label>
        <button name="status" value="declined" formNoValidate className="flex h-10 items-center gap-2 rounded-md border border-rose-200 px-4 text-xs font-bold text-rose-700"><X size={15} />Decline</button>
        <button name="status" value="approved" className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-xs font-bold text-white"><Check size={15} />{pending ? "Saving review..." : "Approve"}</button>
      </div>
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
  </PersistentForm>;
}
