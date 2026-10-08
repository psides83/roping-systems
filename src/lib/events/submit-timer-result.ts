export interface TimerSaveResult { success?: boolean; message?: string; uncertain?: boolean }
import type { TimerDraft } from "./timer-drafts";

export function timerSubmissionData(draft: TimerDraft, timingSessionId: string) {
  if (!draft.submission) throw new Error("Submission must be saved on this device before sending");
  const data = new FormData();
  data.set("runId",draft.runId); data.set("submissionId",draft.submission.id); data.set("timingSessionId",timingSessionId);
  data.set("status",draft.submission.outcome); data.set("penalty","0");
  data.set("expectedRecordedAt",draft.recordedAt ?? ""); data.set("expectedRerunCount",String(draft.rerunCount));
  draft.times.forEach((time) => data.append("timerReading",time));
  draft.penalties.forEach((id) => data.append("penaltyId",id));
  return data;
}

export async function submitTimerResult(eventId: string, runId: string, data: FormData, fetcher: typeof fetch = fetch, timeoutMs = 15000): Promise<TimerSaveResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`/events/${encodeURIComponent(eventId)}/runs/${encodeURIComponent(runId)}/record`, {
      method: "POST", body: data, credentials: "same-origin", signal: controller.signal,
    });
    if (response.status === 401) return { message: "Sign in again before retrying. Your draft is still on this device.", uncertain: true };
    if (!response.ok) throw new Error("Unable to confirm save");
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("success" in result) || typeof result.success !== "boolean") throw new Error("Invalid save confirmation");
    const message = "message" in result && typeof result.message === "string" ? result.message : "";
    return { success: result.success, message };
  } catch {
    return { message: "Save not confirmed. Your draft is kept on this device. Check the connection, then retry this same result.", uncertain: true };
  } finally { clearTimeout(timeout); }
}
