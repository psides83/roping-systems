export type TimerOutcome = "complete" | "no_time" | "disqualified" | "turned_out" | "rerun";
export interface TimerDraft {
  version: 1; userId: string; eventId: string; ropingId: string; round: number; runId: string;
  name: string; rerunCount: number; recordedAt: string | null; times: string[]; penalties: string[];
  updatedAt: number; submission?: { id: string; outcome: TimerOutcome; uncertain: boolean };
}
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const prefix = "roping-timer-draft:v1:";
export const draftChangeEvent = "roping-timer-draft-changed";
const outcomes = new Set(["complete", "no_time", "disqualified", "turned_out", "rerun"]);
export function draftKey(userId: string, eventId: string, runId: string, rerunCount: number) {
  return `${prefix}${userId}:${eventId}:${runId}:${rerunCount}`;
}
export function parseTimerDraft(value: string | null): TimerDraft | null {
  try {
    const d = JSON.parse(value ?? "null");
    if (!d || d.version !== 1 || ![d.userId,d.eventId,d.ropingId,d.runId,d.name].every((v: unknown) => typeof v === "string") ||
      !Number.isInteger(d.round) || d.round < 1 || !Number.isInteger(d.rerunCount) || d.rerunCount < 0 ||
      !(d.recordedAt === null || typeof d.recordedAt === "string") || !Number.isFinite(d.updatedAt) ||
      !Array.isArray(d.times) || d.times.length > 10 || !d.times.every((v: unknown) => typeof v === "string" && v.length <= 30) ||
      !Array.isArray(d.penalties) || d.penalties.length > 100 || !d.penalties.every((v: unknown) => typeof v === "string") ||
      (d.submission && (typeof d.submission.id !== "string" || !outcomes.has(d.submission.outcome) || typeof d.submission.uncertain !== "boolean"))) return null;
    return d as TimerDraft;
  } catch { return null; }
}
export function readTimerDraft(storage: DraftStorage, key: string) { return parseTimerDraft(storage.getItem(key)); }
export function writeTimerDraft(storage: DraftStorage, key: string, draft: TimerDraft) {
  storage.setItem(key, JSON.stringify(draft));
}
export function removeConfirmedDraft(storage: DraftStorage, key: string, submissionId: string) {
  if (readTimerDraft(storage,key)?.submission?.id !== submissionId) return false;
  storage.removeItem(key);
  return true;
}
export function eventTimerDrafts(storage: DraftStorage, userId: string, eventId: string, includeUnsubmitted = false) {
  const drafts: { key: string; draft: TimerDraft }[] = [];
  for (let index=0; index<storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(`${prefix}${userId}:${eventId}:`)) continue;
    const draft = readTimerDraft(storage,key);
    if (draft?.userId === userId && draft.eventId === eventId && (draft.submission || (includeUnsubmitted && (draft.times.some((time) => time !== "") || draft.penalties.length)))) drafts.push({ key, draft });
  }
  return drafts.sort((a,b) => b.draft.updatedAt-a.draft.updatedAt);
}
