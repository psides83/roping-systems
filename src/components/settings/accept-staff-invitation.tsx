"use client";
import { useActionState } from "react";
import { acceptInvitation } from "@/app/staff-invitations/actions";
export function AcceptStaffInvitation({ id }: {id:string}) {
  const [state,action,pending] = useActionState(acceptInvitation,{});
  return <form action={action}><input name="id" value={id} type="hidden" /><button disabled={pending} className="h-10 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Accepting..." : "Accept invitation"}</button>{state.error ? <p role="alert" className="mt-2 text-sm text-rose-700">{state.error}</p> : null}</form>;
}
