"use client";
import { useActionState } from "react";
import { requestConnection } from "@/app/roper/connections/actions";

export function ConnectionRequest() {
  const [state, action, pending] = useActionState(requestConnection, {});
  const input = "h-10 w-64 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3";
  return <form action={action} className="space-y-4">
    <div className="flex flex-wrap gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">Producer URL slug<input className={input} name="producer" required maxLength={160} placeholder="ultimate-calf-roping" /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Member number<input className={input} name="number" required maxLength={80} /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Name on membership<input className={input} name="name" required minLength={2} maxLength={160} autoComplete="name" /></label>
    </div>
    <button disabled={pending} className="h-10 rounded-md bg-[#19231d] px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Sending request..." : "Request connection"}</button>
    {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null}
  </form>;
}
