"use client";

import { useActionState } from "react";
import { Beef, LoaderCircle } from "lucide-react";
import {
  updateClassCattleDraw,
  type CattleFormState,
} from "@/app/(app)/ropings/[ropingId]/actions";

export function ClassCattleDrawForm({
  ropingId,
  divisionId,
  enabled,
  editable,
  embedded = false,
}: {
  ropingId: string;
  divisionId: string;
  enabled: boolean;
  editable: boolean;
  embedded?: boolean;
}) {
  const action = updateClassCattleDraw.bind(null, ropingId, divisionId);
  const [state, formAction, pending] = useActionState<
    CattleFormState,
    FormData
  >(action, {});

  return (
    <form
      action={formAction}
      className={embedded ? "" : "mt-4 border-t border-[#e7ebe8] pt-4"}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="cattleDrawEnabled"
            defaultChecked={enabled}
            disabled={!editable}
            className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
          />
          <Beef size={17} className="text-[var(--brand-accent-strong)]" />
          <span>
            <span className="block text-sm font-bold">
              Draw and track cattle
            </span>
            <span className="mt-1 block text-xs text-[#758078]">
              Adds cattle assignments to this class on the live event desk.
            </span>
          </span>
        </label>
        <button
          disabled={!editable || pending}
          className="flex h-9 items-center justify-center gap-2 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={14} className="animate-spin" /> : null}
          Save cattle setting
        </button>
      </div>
      {state.message ? (
        <p
          className={`mt-2 text-xs ${state.success ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
