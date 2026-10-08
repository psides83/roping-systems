"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, LoaderCircle, ChevronDown } from "lucide-react";
import { draftChangeEvent, eventTimerDrafts, removeConfirmedDraft } from "@/lib/events/timer-drafts";
import { useNetworkStatus } from "./use-network-status";

export function TimerSaveRecovery({ eventId, userId, activeRunId, activeAttempt }: { eventId: string; userId: string; activeRunId?: string; activeAttempt?: number }) {
  const [drafts, setDrafts] = useState<ReturnType<typeof eventTimerDrafts>>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string,string>>({});
  const online = useNetworkStatus();
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const read = () => { if (cancelled) return; try { setDrafts(eventTimerDrafts(window.localStorage,userId,eventId,true)
      .filter(({ draft }) => draft.submission || draft.runId !== activeRunId || draft.rerunCount !== activeAttempt)); } catch { /* The timing form reports unavailable device storage. */ } };
    void Promise.resolve().then(read);
    window.addEventListener(draftChangeEvent,read); window.addEventListener("storage",read);
    return () => { cancelled = true; window.removeEventListener(draftChangeEvent,read); window.removeEventListener("storage",read); };
  }, [eventId,userId,activeRunId,activeAttempt]);

  async function checkSaved(key: string, runId: string, submissionId: string) {
    setChecking(key);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(`/events/${encodeURIComponent(eventId)}/runs/${encodeURIComponent(runId)}/record?submission=${encodeURIComponent(submissionId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.saved === true) {
        removeConfirmedDraft(window.localStorage,key,submissionId);
        window.dispatchEvent(new Event(draftChangeEvent));
        setMessages((current) => ({ ...current, [key]: "Saved to server. Local draft cleared." }));
        router.refresh();
      } else if (result.saved === false) {
        setMessages((current) => ({ ...current, [key]: "Not confirmed on the server. Open this round and retry the original result after taking timing control." }));
      } else throw new Error();
    } catch { setMessages((current) => ({ ...current, [key]: "Saved status could not be checked. Draft retained; reconnect and try again." })); }
    finally { window.clearTimeout(timeout); setChecking(null); }
  }
  const confirmed = Object.values(messages).filter((message) => message.startsWith("Saved to server"));
  if (!drafts.length) return confirmed.length ? <p role="status" className="text-sm font-semibold text-emerald-700">Saved to server. Recovered submissions confirmed.</p> : null;
  return <details className="group rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-amber-900">{drafts.length} device {drafts.length === 1 ? "draft needs" : "drafts need"} review or confirmation<ChevronDown size={18} className="shrink-0 transition-transform group-open:rotate-180" /></summary>
    <div className="mt-3 divide-y divide-amber-200">{drafts.map(({ key,draft }) => <div key={key} className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{draft.name} · Round {draft.round}</p>
        <div className="flex flex-wrap gap-2">
          {draft.submission ? <button type="button" disabled={!online || Boolean(checking)} onClick={() => void checkSaved(key,draft.runId,draft.submission!.id)} className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-400 bg-white px-3 text-sm font-semibold disabled:opacity-40">{checking === key ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}Check saved status</button> : null}
          <Link href={`/events/${eventId}/live?division=${encodeURIComponent(draft.ropingId)}&round=${draft.round}`} className="inline-flex h-10 items-center rounded-md border border-amber-400 bg-white px-3 text-sm font-semibold">Open round</Link>
        </div>
      </div>
      <p className="text-xs text-amber-900">{!draft.submission || draft.submission.outcome === "complete" ? `Timers: ${draft.times.join(" / ")} sec` : draft.submission.outcome.replaceAll("_"," ")}</p>
      {messages[key] ? <p role="status" className="text-sm text-amber-900">{messages[key]}</p> : null}
    </div>)}</div>
  </details>;
}
