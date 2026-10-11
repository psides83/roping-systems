"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { reviewConnection } from "@/app/(app)/members/account-links/actions";

export function ReviewConnection({ id, status, members }: { id: string; status: string; members: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(reviewConnection, {});
  return <PersistentForm action={action} className="mt-4 flex flex-wrap items-end gap-3">
    <input type="hidden" name="id" value={id} />
    {status === "pending" ? <>
      <label className="flex max-w-full flex-col gap-1 text-sm">Member record<select name="member" className="h-10 w-64 max-w-full rounded-md border px-3"><option value="">Choose a verified member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-sm">Decision<select name="decision" className="h-10 w-40 rounded-md border px-3"><option value="declined">Decline</option><option value="approved">Approve</option></select></label>
    </> : <input type="hidden" name="decision" value="revoked" />}
    <label className="flex max-w-full flex-col gap-1 text-sm">Verification or decision reason<input name="reason" required minLength={5} maxLength={1000} className="h-10 w-80 max-w-full rounded-md border px-3" /></label>
    <button disabled={pending} className="h-10 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : status === "approved" ? "Revoke connection" : "Save decision"}</button>
    {state.error ? <p role="alert" className="basis-full text-sm text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="basis-full text-sm text-emerald-700">{state.success}</p> : null}
  </PersistentForm>;
}
