"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import { updateStandingsCarryover } from "@/app/(app)/settings/classification-watch/actions";

export function StandingsCarryoverSettings({ capped, canEdit }: { capped: boolean; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateStandingsCarryover, {});
  return <section className="border-t border-[#dfe4e1] pt-5">
    <h2 className="font-bold">Standings carryover</h2>
    <PersistentForm action={action} className="mt-3 flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="cap" defaultChecked={capped} disabled={!canEdit || pending} className="h-4 w-4" />
        Cap carryover at the new class leader’s earnings
      </label>
      {canEdit ? <button disabled={pending} className="flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? <LoaderCircle size={15} className="animate-spin" /> : null}Save
      </button> : null}
      {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-emerald-700">Saved</p> : null}
    </PersistentForm>
  </section>;
}
