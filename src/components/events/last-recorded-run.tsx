import { CheckCircle2 } from "lucide-react";
import { calculateFinalRunTime } from "@/lib/scoring";
import { runStatusLabels } from "@/lib/run-status";
import { EntryLabel } from "./entry-label";
import { RunCorrectionDialog } from "./run-correction-dialog";
import type { LiveRunRow } from "./database-live-desk";

export function LastRecordedRun({ eventId, run, timerCount, canEdit }: {
  eventId: string; run: LiveRunRow; timerCount: number; canEdit: boolean;
}) {
  const result = run.status === "complete" && run.rawTime !== null
    ? `${calculateFinalRunTime(run.rawTime, run.penalty, run.incentiveAdjustment).toFixed(2)} sec`
    : runStatusLabels[run.status];
  return <section aria-label="Last recorded result" className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
    <div role="status" aria-live="polite" className="min-w-0 flex-1 text-sm">
      <p className="text-xs font-semibold text-emerald-800">Last recorded result</p>
      <p className="mt-1 break-words font-semibold">{run.name} · <EntryLabel number={run.entryNumber} /></p>
      <p className="mt-1 font-mono text-emerald-900">{result}</p>
    </div>
    {canEdit ? <RunCorrectionDialog eventId={eventId} run={run} timerCount={timerCount} canEdit={canEdit} /> : null}
  </section>;
}
