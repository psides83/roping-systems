"use client";
import { useActionState } from "react";
import { Save, LoaderCircle } from "lucide-react";
import { assignStaffArena, type StaffActionState } from "@/app/(app)/settings/staff/actions";

export function StaffArenaForm({ userId, eventId, arenaCount, arenaNumber }: {
  userId: string; eventId: string; arenaCount: number; arenaNumber: number | null;
}) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(assignStaffArena, {});
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="userId" value={userId} /><input type="hidden" name="eventId" value={eventId} />
    <select name="arena" aria-label="Assigned timing arena" defaultValue={arenaNumber ?? "all"} disabled={pending} className="h-10 w-40 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
      <option value="all">All arenas</option>{Array.from({ length: arenaCount }, (_, index) => <option key={index + 1} value={index + 1}>Arena {index + 1}</option>)}
    </select>
    <button disabled={pending} aria-label="Save arena assignment" title="Save arena assignment" className="grid h-10 w-10 place-items-center rounded-md border border-[#ccd4d0] disabled:opacity-40">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}</button>
    {state.error ? <p role="alert" className="basis-full text-xs text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-xs text-emerald-700">Saved</p> : null}
  </form>;
}
