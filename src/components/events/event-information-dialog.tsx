"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Info, LoaderCircle } from "lucide-react";
import { PublicEventDialog } from "./public-event-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { saveEventInformation } from "@/app/(app)/events/[eventId]/information-actions";
import type { EventInformation } from "@/lib/events/event-information";

export function EventInformationDialog({ eventId, information }: { eventId: string; information: EventInformation }) {
  const [open, setOpen] = useState(false);
  return <><button data-close-mobile-menu type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-md border bg-white px-3 text-sm font-semibold"><Info size={16}/>Public information</button>
    {open && <PublicEventDialog title="Public information" onClose={() => setOpen(false)}><InformationForm eventId={eventId} information={information} close={() => setOpen(false)}/></PublicEventDialog>}</>;
}
function InformationForm({ eventId, information, close }: { eventId: string; information: EventInformation; close: () => void }) {
  const [state, action, pending] = useActionState(saveEventInformation.bind(null, eventId), {});
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => { if (state.success) closeRef.current(); }, [state.success]);
  const input = "mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm font-normal";
  return <form action={action} className="space-y-5"><h3 className="text-lg font-bold">Public event information</h3>
    <label className="block text-sm font-semibold">Flyer link<input name="flyer_url" type="url" defaultValue={information.flyer_url} placeholder="https://…" maxLength={2000} className={input}/></label>
    <div className="flex flex-wrap gap-3">
      <label className="block max-w-full text-sm font-semibold">Contact name<input name="contact_name" defaultValue={information.contact_name} maxLength={120} className={`${input} !w-52 max-w-full`}/></label>
      <label className="block max-w-full text-sm font-semibold">Phone<PhoneInput name="contact_phone" defaultValue={information.contact_phone} className={`${input} !w-44 max-w-full`}/></label>
      <label className="block max-w-full text-sm font-semibold">Email<input name="contact_email" type="email" defaultValue={information.contact_email} className={`${input} !w-60 max-w-full`}/></label>
    </div>
    {([['directions', 'Directions & parking'], ['venue_information', 'Venue information'], ['entry_information', 'Entry information']] as const).map(([name,label]) => <label key={name} className="block text-sm font-semibold">{label}<textarea name={name} defaultValue={information[name]} rows={3} maxLength={4000} className="mt-1 w-full rounded-md border bg-white p-3 text-sm font-normal"/></label>)}
    {state.message && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.message}</p>}
    <div className="flex justify-end gap-2 border-t pt-4"><button type="button" disabled={pending} onClick={close} className="h-10 rounded-md border px-4 text-sm font-semibold">Cancel</button><button disabled={pending} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white">{pending && <LoaderCircle size={16} className="animate-spin"/>}{pending ? "Saving…" : "Save information"}</button></div>
  </form>;
}
