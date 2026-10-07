"use client";
import { useActionState } from "react";
import { LoaderCircle, MailPlus, Save, UserMinus, X } from "lucide-react";
import { manageStaff, type StaffActionState } from "@/app/(app)/settings/staff/actions";
export function StaffAccessForm({ operation, id, role = "viewer", owner = false, platformOwner = false }: {
  operation: "invite" | "role" | "remove" | "cancel"; id?: string; role?: string; owner?: boolean; platformOwner?: boolean;
}) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(manageStaff, {});
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="operation" value={operation} /><input type="hidden" name="id" value={id ?? ""} />
    {operation === "invite" ? <input aria-label="Staff email" name="email" type="email" required placeholder="Staff email" className="h-10 w-64 max-w-full rounded-md border border-[#ccd4d0] px-3 text-sm" /> : null}
    {operation === "invite" || operation === "role" ? <select name="role" aria-label="Staff role" defaultValue={role} className="h-10 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
      {platformOwner ? <option value="owner">Producer Owner</option> : null}{owner ? <option value="admin">Administrator</option> : null}<option value="operator">Operator</option><option value="viewer">Viewer</option>
    </select> : null}
    <button disabled={pending} title={operation === "role" ? "Save role" : operation === "remove" ? "Revoke staff access" : operation === "cancel" ? "Cancel invitation" : "Create invitation"}
      aria-label={operation === "role" ? "Save role" : operation === "remove" ? "Revoke staff access" : operation === "cancel" ? "Cancel invitation" : "Create invitation"}
      onClick={operation === "remove" ? (event) => { if (!window.confirm("Revoke this staff member's producer access?")) event.preventDefault(); } : undefined}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-50">
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : operation === "invite" ? <MailPlus size={16} /> : operation === "role" ? <Save size={16} /> : operation === "remove" ? <UserMinus size={16} /> : <X size={16} />}
      {operation === "invite" ? "Invite staff" : null}
    </button>
    {state.error ? <p role="alert" className="basis-full text-xs text-rose-700">{state.error}</p> : state.success ? <p role="status" className="basis-full text-xs text-emerald-700">{operation === "invite" ? "Invitation pending acceptance" : "Saved"}</p> : null}
  </form>;
}
