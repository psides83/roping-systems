"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { CalendarPlus, LoaderCircle, X } from "lucide-react";
import { assignStaffEvent, type StaffActionState } from "@/app/(app)/settings/staff/actions";

export function StaffEventForm({ userId, events, eventId }: {
  userId: string; events?: { id: string; name: string }[]; eventId?: string;
}) {
  const [state, action, pending] = useActionState<StaffActionState, FormData>(assignStaffEvent, {});
  return <PersistentForm action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="userId" value={userId} />
    <input type="hidden" name="assigned" value={eventId ? "false" : "true"} />
    {eventId ? <input type="hidden" name="eventId" value={eventId} /> :
      <select name="eventId" aria-label="Event assignment" required defaultValue="" className="h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
        <option value="" disabled>Choose event</option>
        {events?.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>}
    <button disabled={pending} aria-label={eventId ? "Remove event assignment" : "Assign event"} title={eventId ? "Remove event assignment" : "Assign event"}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold disabled:opacity-50">
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : eventId ? <X size={16} /> : <CalendarPlus size={16} />}
      {!eventId ? "Assign" : null}
    </button>
    {state.error ? <p role="alert" className="basis-full text-xs text-rose-700">{state.error}</p> : null}
    {state.success ? <p role="status" className="basis-full text-xs text-emerald-700">Saved</p> : null}
  </PersistentForm>;
}
