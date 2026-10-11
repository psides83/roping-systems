"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useRef, useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { recordFinalsDecision } from "@/app/(app)/settings/finals/actions";

export function FinalsDecisionForm({ seasonId, ruleId, place, kind, candidates }: {
  seasonId: string; ruleId: string; place: number; kind: "tie" | "revoke";
  candidates: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(recordFinalsDecision, {});
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (state.success && disclosure.current) disclosure.current.open = false; }, [state]);
  return <details ref={disclosure} className="mt-2"><summary className={`cursor-pointer text-sm font-semibold ${kind === "revoke" ? "text-red-700" : "text-[#3345a7]"}`}>{kind === "tie" ? "Resolve tie" : "Revoke award"}</summary>
    <PersistentForm action={action} className="mt-3 space-y-3">
      <input type="hidden" name="seasonId" value={seasonId} /><input type="hidden" name="ruleId" value={ruleId} /><input type="hidden" name="place" value={place} /><input type="hidden" name="kind" value={kind} />
      <fieldset disabled={pending} className="space-y-3">
        {kind === "tie" ? <div className="flex flex-wrap gap-4">{candidates.map((candidate) => <label key={candidate.id} className="flex items-center gap-2 text-sm"><input name="entryIds" type="checkbox" value={candidate.id} />{candidate.name}</label>)}</div> : <input type="hidden" name="entryIds" value={candidates[0]?.id} />}
        <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-semibold">Reason<input name="reason" minLength={5} maxLength={2000} required className="h-10 w-80 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" /></label>
          <button className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold">{pending && <LoaderCircle size={16} className="animate-spin" />}{kind === "tie" ? "Confirm recipients" : "Confirm revocation"}</button></div>
      </fieldset>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    </PersistentForm>
  </details>;
}
