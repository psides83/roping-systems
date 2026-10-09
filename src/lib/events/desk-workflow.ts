import { isResolvedRunStatus, type RunStatus } from "../run-status";

interface DeskStateInput {
  ropingStatus?: string;
  eventStatus: string; roundLocked: boolean; drawReady: boolean; dirty: boolean;
  isShortRound: boolean; shortRoundSeeded: boolean; shortRoundLocked: boolean; mainRoundsComplete: boolean;
  runs: { status: RunStatus }[];
}
export function deskWorkflowState(input: DeskStateInput) {
  if (input.eventStatus === "cancelled") return { title: "Event cancelled", message: "Timing is closed. Existing records remain available for review." };
  if (input.eventStatus === "completed") return { title: "Competition completed", message: "Review results and continue to payouts. Timing is closed." };
  if (input.ropingStatus === "completed") return { title: "Roping completed", message: "Continue to the next roping, or finalize this roping's payouts on the Payouts page." };
  if (input.ropingStatus === "paused" || input.ropingStatus === "delayed") return { title: input.ropingStatus === "paused" ? "Roping paused" : "Roping delayed", message: "An event manager must resume this roping before the next run is recorded." };
  if (input.roundLocked) return { title: "Round completed", message: "Continue to the next round or roping. Corrections require a reason." };
  if (!input.runs.length) return input.isShortRound
    ? input.shortRoundSeeded
      ? { title: "No short-round qualifiers", message: "No entry qualified for the short round. Review the field before completing the roping." }
      : { title: "Short round not built", message: input.mainRoundsComplete ? "Build the short-round field from the main-round aggregate." : "Resolve every main-round run and rerun before building the short round." }
    : { title: "Waiting for entries", message: "Add contestants in Entries before building the order." };
  if (!input.drawReady) return { title: "Order not built", message: "Build the order before recording times." };
  if (input.dirty) return { title: "Unsaved order", message: "Save or discard order changes before recording another result." };
  if (input.eventStatus !== "in_progress") return { title: "Ready to start", message: "Start the event when the arena is ready." };
  if (input.isShortRound && !input.shortRoundLocked) return { title: "Review short-round field", message: "Review and lock the qualifiers before recording short-round times." };
  if (input.runs.some((r) => r.status === "pending")) return null;
  const reruns = input.runs.filter((r) => r.status === "rerun").length;
  if (reruns) return { title: "Reruns awaiting scheduling", message: `${reruns} ${reruns === 1 ? "rerun remains" : "reruns remain"}. Choose next available or end of round before completing this round.` };
  if (input.runs.every((r) => isResolvedRunStatus(r.status))) return { title: "Ready to complete round", message: "Every run has a result. Complete this round to lock it and continue." };
  return null;
}
