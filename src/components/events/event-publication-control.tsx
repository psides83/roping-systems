"use client";

import { useActionState, useId, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateEventPublication, type PublicationState } from "@/app/(app)/events/[eventId]/publication-actions";
import { SetupReadinessForm } from "./setup-readiness-form";

export function EventPublicationControl({ eventId, publicationState, enabled }: {
  eventId: string;
  publicationState: "draft" | "published" | "unpublished";
  enabled: boolean;
}) {
  const hintId = useId();
  const [selected, setSelected] = useState(publicationState);
  const [state, action, pending] = useActionState(updateEventPublication.bind(null, eventId), {} as PublicationState);
  if (!enabled) return <p className="text-sm text-[#66716b]">Event management access is required to change visibility.</p>;
  const changed = selected !== publicationState;
  return (
    <SetupReadinessForm eventId={eventId} mode={selected === "published" && publicationState !== "published" ? "publish" : null} action={action} pending={pending} success={state.success} message={state.message} className="flex flex-wrap items-center gap-2">
      <label className="grid min-w-0 flex-1 gap-2 text-sm font-semibold text-[#526059]">
        Change visibility
        <select name="publicationState" value={selected} disabled={!enabled || pending} onChange={(event) => setSelected(event.target.value as typeof selected)} aria-describedby={hintId} className="h-11 w-full min-w-0 rounded-md border border-[#ccd4d0] bg-white px-2 text-sm">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
      </label>
      <button disabled={!enabled || pending || selected === publicationState} aria-label="Save public visibility" title="Save public visibility" className="flex min-h-11 items-center gap-2 self-end rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-40">
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
        {pending ? "Saving..." : "Save"}
      </button>
      <p id={hintId} role="status" className="w-full text-sm leading-6 text-[#526059]">{pending ? "Saving visibility. Waiting for confirmation." : changed ? `Unsaved change: ${selected === "published" ? "the event will be visible to the public" : "the event will be hidden from the public"}. Choose Save to apply.` : "Changing visibility does not start competition or finalize results."}</p>
      {state.message ? <p role={state.success ? "status" : "alert"} className={`w-full text-sm ${state.success ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}
    </SetupReadinessForm>
  );
}
