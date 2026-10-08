"use client";
import { NumberStepper } from "@/components/ui/number-stepper";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveMoveBackRequirement } from "@/app/(app)/settings/classification-watch/move-back-actions";

export function ClassificationMoveBackSettings({ enabled, minimumRopings, canEdit }: { enabled: boolean; minimumRopings: number; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveMoveBackRequirement, {});
  return <section className="border-y border-[#dfe4e1] bg-white p-5">
    <h2 className="font-bold">Move-back review requirement</h2>
    <form action={action} className="mt-4 space-y-3">
      <fieldset disabled={!canEdit || pending} className="flex min-w-0 flex-wrap items-end gap-4">
        <label className="flex h-10 items-center gap-2 text-sm font-semibold"><input name="enabled" type="checkbox" defaultChecked={enabled} />Require participation after a move</label>
        <label className="grid gap-1 text-xs font-semibold">Separate ropings<NumberStepper label="Separate ropings" name="minimumRopings" min="1" max="100" required defaultValue={minimumRopings} className="h-10 w-24 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal" /></label>
        <span className="flex h-10 items-center text-xs text-[#66716b]">{enabled ? "Enabled" : "Off"}</span>
        {canEdit ? <button className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold"><Save size={15} />{pending ? "Saving..." : "Save"}</button> : null}
      </fieldset>
      <p className="max-w-2xl text-xs leading-5 text-[#66716b]">Count each roping in the same division once after the classification move. Qualified times and no-time runs count; entries alone and turnouts do not. Staff can approve a documented exception.</p>
      {state.error ? <p role="alert" className="text-sm text-red-700">{state.error}</p> : state.success ? <p role="status" className="text-sm text-emerald-700">Saved</p> : null}
    </form>
  </section>;
}
