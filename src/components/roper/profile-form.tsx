"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { saveContact, requestCorrection, type ProfileState } from "@/app/roper/profile/actions";
import { PhoneInput } from "@/components/ui/phone-input";
import type { RoperProfile } from "@/lib/roper-profile";

const input = "h-10 w-64 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3";
const label = "flex max-w-full flex-col gap-1 text-sm font-semibold";
function Feedback({ state }: { state: ProfileState }) {
  return state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null;
}
export function ProfileForm({ profile }: { profile: RoperProfile }) {
  const [contact, contactAction, saving] = useActionState(saveContact, {});
  const [correction, correctionAction, requesting] = useActionState(requestCorrection, {});
  const hasPending = profile.corrections.some((q) => q.status === "pending");
  return <div className="space-y-7">
    <section className="space-y-4"><h2 className="text-lg font-bold">Contact details</h2>
      <p className="max-w-2xl text-sm text-[#66716b]">These updates apply to memberships sharing this roper record. Contact email is separate from your sign-in email.</p>
      <PersistentForm action={contactAction} className="space-y-4">
        <input type="hidden" name="membership" value={profile.membershipId} /><input type="hidden" name="profileRevision" value={profile.profileRevision} /><input type="hidden" name="membershipRevision" value={profile.membershipRevision} />
        <div className="flex flex-wrap gap-4">
          <label className={label}>Contact email<input name="email" type="email" defaultValue={profile.email} maxLength={254} autoComplete="email" className={input} /></label>
          <label className={label}>Phone<PhoneInput defaultValue={profile.phone} className={input} /></label>
          <label className={label}>City<input name="city" defaultValue={profile.city} maxLength={100} autoComplete="address-level2" className={input} /></label>
          <label className={label}>State<input name="state" defaultValue={profile.state} maxLength={100} autoComplete="address-level1" className={input} /></label>
        </div>
        <button disabled={saving} className="h-10 rounded-md bg-[#19231d] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving contact details..." : "Save contact details"}</button><Feedback state={contact} />
      </PersistentForm>
    </section>
    <section className="space-y-4 border-t border-[#dfe4e1] pt-5"><h2 className="text-lg font-bold">Eligibility details</h2>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>Birth date: <strong>{profile.birthDate ?? "Not recorded"}</strong></p><p>Competition gender: <strong className="capitalize">{profile.gender ?? "Not recorded"}</strong></p></div>
      <p className="max-w-2xl text-sm text-[#66716b]">Your producer must verify corrections to these details. Classifications and membership status remain staff-managed.</p>
      {!hasPending ? <details><summary className="cursor-pointer text-sm font-semibold">Request an eligibility correction</summary><PersistentForm action={correctionAction} className="mt-4 space-y-4">
        <input type="hidden" name="membership" value={profile.membershipId} />
        <div className="flex flex-wrap gap-4"><label className={label}>Corrected birth date<input type="date" name="birthDate" className={input} /></label><label className={label}>Corrected competition gender<select name="gender" className={input} defaultValue=""><option value="">Keep current</option><option value="female">Female</option><option value="male">Male</option></select></label></div>
        <label className={label}>Reason for correction<textarea name="reason" minLength={5} maxLength={1000} required rows={3} className="w-96 max-w-full rounded-md border border-[#ccd4d0] p-3" /></label>
        <button disabled={requesting} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold disabled:opacity-50">{requesting ? "Sending correction..." : "Submit for staff review"}</button><Feedback state={correction} />
      </PersistentForm></details> : <p role="status" className="text-sm text-amber-800">An eligibility correction is awaiting producer review.</p>}
      {profile.corrections.map((q) => <div key={q.id} className="border-t border-[#dfe4e1] py-3 text-sm"><p className="font-semibold capitalize">{q.status}</p><p>{q.birthDate ? `Birth date: ${q.birthDate}` : ""}{q.gender ? ` · Competition gender: ${q.gender}` : ""}</p><p className="text-[#66716b]">{q.reason}</p>{q.reviewReason ? <p className="mt-1 text-[#66716b]">Staff: {q.reviewReason}</p> : null}</div>)}
    </section>
  </div>;
}
