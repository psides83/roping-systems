import { CheckCircle2, AlertCircle } from "lucide-react";
import { eligibilityLabels, type OnlineEntryEligibility } from "@/lib/online-entry-eligibility";

export function EntryEligibilityFeedback({ check }: { check: OnlineEntryEligibility }) {
  const passed = check.status === "eligible";
  const Icon = passed ? CheckCircle2 : AlertCircle;
  return <div className={`mt-3 border-l-2 pl-3 text-xs leading-5 ${passed ? "border-emerald-400 text-emerald-800" : "border-amber-400 text-amber-900"}`}>
    <p className="flex items-center gap-1.5 font-semibold"><Icon size={14} className="shrink-0" />{eligibilityLabels[check.status]}</p>
    {check.messages.length > 0 && <ul className="mt-1 space-y-1">{check.messages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
    {check.remaining_entries !== null && <p>{check.remaining_entries} {check.remaining_entries === 1 ? "entry" : "entries"} available</p>}
  </div>;
}
