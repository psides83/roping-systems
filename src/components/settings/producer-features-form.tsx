"use client";
import { useActionState } from "react";
import { saveFeatures } from "@/app/(app)/settings/features/actions";
import { featureEnabled, producerFeatures, type ProducerFeatures } from "@/lib/producer-features";
export function ProducerFeaturesForm({ features, revision, editable }: { features: ProducerFeatures; revision: number; editable: boolean }) {
  const [state, action, pending] = useActionState(saveFeatures, {});
  return <form action={action} className="space-y-6">
    <input type="hidden" name="revision" value={revision} />
    <fieldset disabled={!editable || pending} className="grid gap-6 sm:grid-cols-2">
      {[...new Set(producerFeatures.map(f => f.group))].map(group => <section key={group} className="border-t border-[#d7ddda] pt-4">
        <h2 className="mb-3 font-bold">{group}</h2>
        {producerFeatures.filter(f => f.group === group).map(f => <label key={f.key} className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name={f.key} defaultChecked={featureEnabled(features, f.key)} className="h-5 w-5 accent-[var(--brand-accent)]" />{f.label}
        </label>)}
      </section>)}
    </fieldset>
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
    {editable && <button disabled={pending} className="rounded-md bg-[var(--brand-accent)] px-4 py-2 font-semibold text-white">{pending ? "Saving..." : "Save preferences"}</button>}
  </form>;
}
