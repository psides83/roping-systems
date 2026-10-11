"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState } from "react";
import { saveFeatures } from "@/app/(app)/settings/features/actions";
import { featureEnabled, producerFeatures, producerFeatureDescriptions, type ProducerFeatures } from "@/lib/producer-features";
export function ProducerFeaturesForm({ features, revision, editable }: { features: ProducerFeatures; revision: number; editable: boolean }) {
  const [state, action, pending] = useActionState(saveFeatures, {});
  return <PersistentForm action={action} className="space-y-6">
    <input type="hidden" name="revision" value={revision} />
    <fieldset disabled={!editable || pending} className="grid gap-6 sm:grid-cols-2">
      {[...new Set(producerFeatures.map(f => f.group))].map(group => <section key={group} className="border-t border-[#d7ddda] pt-4">
        <h2 className="mb-3 font-bold">{group}</h2>
        {producerFeatures.filter(f => f.group === group).map(f => <label key={f.key} className="flex min-h-11 items-start gap-3 py-2 text-sm">
          <input type="checkbox" name={f.key} defaultChecked={featureEnabled(features, f.key)} aria-describedby={`feature-${f.key}-description`} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-accent)]" /><span><span className="font-semibold">{f.label}</span><span id={`feature-${f.key}-description`} className="mt-1 block text-xs leading-5 text-[#66716b]">{producerFeatureDescriptions[f.key]}</span></span>
        </label>)}
      </section>)}
    </fieldset>
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
    {editable && <button disabled={pending} className="rounded-md bg-[var(--brand-accent)] px-4 py-2 font-semibold text-white">{pending ? "Saving..." : "Save preferences"}</button>}
  </PersistentForm>;
}
