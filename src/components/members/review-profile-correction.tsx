"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { reviewProfile } from "@/app/(app)/members/profile-requests/actions";
export function ReviewProfileCorrection({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewProfile, {});
  return <PersistentForm action={action} className="mt-4 flex flex-wrap items-end gap-3">
    <input type="hidden" name="id" value={id} />
    <label className="flex flex-col gap-1 text-sm font-semibold">Decision<select name="decision" className="h-10 w-40 rounded-md border px-3"><option value="declined">Decline</option><option value="approved">Approve</option></select></label>
    <label className="flex max-w-full flex-col gap-1 text-sm font-semibold">Verification or decision reason<input name="reason" minLength={5} maxLength={1000} required className="h-10 w-80 max-w-full rounded-md border px-3" /></label>
    <button disabled={pending} className="h-10 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving decision..." : "Save decision"}</button>
    {state.error ? <p role="alert" className="basis-full text-sm text-rose-700">{state.error}</p> : null}{state.success ? <p role="status" className="basis-full text-sm text-emerald-700">{state.success}</p> : null}
  </PersistentForm>;
}
