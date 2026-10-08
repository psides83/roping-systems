"use client";
import { useEffect, useRef, useState } from "react";
import { draftKey, draftChangeEvent, readTimerDraft, writeTimerDraft, removeConfirmedDraft, type TimerDraft, type TimerOutcome } from "@/lib/events/timer-drafts";
import type { TimerSaveResult } from "@/lib/events/submit-timer-result";

type Scope = Pick<TimerDraft, "userId" | "eventId" | "ropingId" | "round" | "runId" | "name" | "rerunCount" | "recordedAt">;
export function useTimerDraft(scope: Scope, timerCount: number) {
  const key = draftKey(scope.userId,scope.eventId,scope.runId,scope.rerunCount);
  const [draft, setDraft] = useState<TimerDraft>(() => ({ ...scope, version: 1, times: Array.from({ length: timerCount }, () => ""), penalties: [], updatedAt: 0 }));
  const current = useRef(draft);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [stale, setStale] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = readTimerDraft(window.localStorage,key);
        if (saved && saved.userId === scope.userId && saved.eventId === scope.eventId && saved.runId === scope.runId && saved.rerunCount === scope.rerunCount) {
          current.current = saved; setDraft(saved); setRestored(true);
          setStale(saved.recordedAt !== scope.recordedAt || saved.times.length !== timerCount);
        }
      } catch { setStorageError("Device storage is unavailable. Readings will only remain in this open page until saved to the server."); }
      setReady(Boolean(scope.userId));
    });
    return () => { cancelled = true; };
  }, [key,scope.userId,scope.eventId,scope.runId,scope.rerunCount,scope.recordedAt,timerCount]);

  function commit(next: TimerDraft) {
    current.current = next; setDraft(next);
    try { writeTimerDraft(window.localStorage,key,next); setStorageError(""); window.dispatchEvent(new Event(draftChangeEvent)); }
    catch { setStorageError("Draft could not be saved on this device. Keep this page open until the server confirms your save."); }
  }
  function setTimes(update: (times: string[]) => string[]) {
    if (current.current.submission || stale) return;
    commit({ ...current.current, times: update(current.current.times), updatedAt: Date.now() });
  }
  function setPenalties(penalties: string[]) {
    if (current.current.submission || stale) return;
    commit({ ...current.current, penalties, updatedAt: Date.now() });
  }
  function prepare(outcome: TimerOutcome) {
    const next = { ...current.current, updatedAt: Date.now(), submission: current.current.submission ?? { id: crypto.randomUUID(), outcome, uncertain: false } };
    commit(next);
    return next;
  }
  function finish(result: TimerSaveResult) {
    const submission = current.current.submission;
    if (!submission) return;
    if (result.success) {
      try { removeConfirmedDraft(window.localStorage,key,submission.id); window.dispatchEvent(new Event(draftChangeEvent)); }
      catch { setStorageError("Saved to server, but the local draft could not be cleared."); }
    } else if (result.uncertain || submission.uncertain) {
      commit({ ...current.current, submission: { ...submission, uncertain: true } });
    } else {
      commit({ ...current.current, submission: undefined });
    }
  }
  function discard() {
    if (!window.confirm("Discard this device draft? If a save was not confirmed, check the recorded result before entering different times.")) return;
    try { window.localStorage.removeItem(key); window.dispatchEvent(new Event(draftChangeEvent)); }
    catch { setStorageError("Unable to clear this device draft."); return; }
    const next: TimerDraft = { ...scope, version: 1, times: Array.from({ length: timerCount }, () => ""), penalties: [], updatedAt: 0 };
    current.current = next; setDraft(next); setStale(false); setRestored(false);
  }
  return { draft, ready, restored, stale, storageError, setTimes, setPenalties, prepare, finish, discard };
}
