"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateEventPublication, type PublicationState } from "@/app/(app)/events/[eventId]/publication-actions";

export function EventPublicationControl({ eventId, publicationState, enabled }: {
  eventId: string;
  publicationState: "draft" | "published" | "unpublished";
  enabled: boolean;
}) {
  const [selected, setSelected] = useState(publicationState);
  const [state, action, pending] = useActionState(updateEventPublication.bind(null, eventId), {} as PublicationState);
  return (
    <form action={action} onSubmit={(event) => {
      if (selected === "published" && publicationState !== "published" && !window.confirm("Publish this event's schedule and contestant results for everyone to view?")) event.preventDefault();
    }} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-[#66716b]">
        Public visibility
        <select name="publicationState" value={selected} disabled={!enabled || pending} onChange={(event) => setSelected(event.target.value as typeof selected)} className="h-9 rounded-md border border-[#ccd4d0] bg-white px-2 text-xs">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
      </label>
      <button disabled={!enabled || pending || selected === publicationState} aria-label="Save public visibility" title="Save public visibility" className="grid h-9 w-9 place-items-center rounded-md border border-[#ccd4d0] bg-white disabled:opacity-40">
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
      </button>
      {state.message ? <p role="status" className={`w-full text-xs ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
    </form>
  );
}
