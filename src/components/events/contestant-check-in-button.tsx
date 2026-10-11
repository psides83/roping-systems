"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { Check, LoaderCircle, Undo2 } from "lucide-react";
import {
  updateContestantCheckIn,
  type CheckInFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";

export function ContestantCheckInButton({
  eventId,
  personId,
  contestantName,
  checkedIn,
  checkedInAt,
  enabled,
}: {
  eventId: string;
  personId: string;
  contestantName: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  enabled: boolean;
}) {
  const boundAction = updateContestantCheckIn.bind(null, eventId, personId);
  const [state, action, pending] = useActionState<CheckInFormState, FormData>(
    boundAction,
    {},
  );

  return (
    <PersistentForm action={action} className="flex flex-col items-start gap-1.5">
      <input
        type="hidden"
        name="checkedIn"
        value={checkedIn ? "false" : "true"}
      />
      <button
        disabled={!enabled || pending}
        aria-label={`${checkedIn ? "Undo check-in for" : "Check in"} ${contestantName}`}
        className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:opacity-50 ${checkedIn ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-[#ccd4d0] bg-white text-[#46524b]"}`}
      >
        {pending ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : checkedIn ? (
          <Undo2 size={14} />
        ) : (
          <Check size={14} />
        )}
        {checkedIn ? "Checked in" : "Check in"}
      </button>
      {checkedInAt ? (
        <span className="text-[10px] text-[#758078]">{checkedInAt}</span>
      ) : null}
      {state.message && !state.success ? (
        <span className="max-w-40 text-[10px] text-rose-700" aria-live="polite">
          {state.message}
        </span>
      ) : null}
    </PersistentForm>
  );
}
