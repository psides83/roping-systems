"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadAvailableQualificationRuleSets } from "@/app/(app)/events/[eventId]/rule-set-actions";

export function EventQualificationFields() {
  const [required, setRequired] = useState(false);
  const [rules, setRules] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadAvailableQualificationRuleSets().then((result) => { if (active) setRules(result); }).catch(() => { if (active) setError("Unable to load qualification rules. Try reopening the event form."); });
    return () => { active = false; };
  }, []);
  return <section className="border-y border-[#dfe4e1] py-4">
    <label className="flex items-center gap-2 text-sm font-semibold"><input name="requiresQualification" type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />Requires qualification</label>
    {required && <div className="mt-3 space-y-2"><label className="block text-sm font-semibold">Qualification rule set<select name="qualificationRuleSetId" required className="mt-2 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3" defaultValue=""><option value="">{rules === null ? "Loading rules..." : "Choose a rule set"}</option>{rules?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<Link href="/settings/qualifications" className="inline-block text-xs font-semibold underline">Manage qualification rules</Link></div>}
  </section>;
}
