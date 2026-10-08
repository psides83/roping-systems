"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LockKeyhole, Radio, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { confirmDeskNavigation } from "./use-desk-leave-guard";

type ControlStatus = { ownsControl: boolean; holder: string | null; remainingSeconds: number; allowed: boolean };
const TimingContext = createContext({ sessionId: "", canWrite: false });
export const useTimingControl = () => useContext(TimingContext);

export function TimingControl({ ropingId, enabled, canTakeover, children }: {
  ropingId: string; enabled: boolean; canTakeover: boolean; children: ReactNode;
}) {
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<ControlStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [takeover, setTakeover] = useState(false);
  const [reason, setReason] = useState("");
  const deadline = useRef(0);
  const inFlight = useRef(false);
  const owns = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    let cancelled = false;
    const id = crypto.randomUUID();
    const db = createClient();
    async function check() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const started = Date.now();
        const result = await db.rpc("manage_roping_timing", { target_roping: ropingId, browser_session: id, operation: owns.current ? "renew" : "status" });
        if (cancelled) return;
        setSessionId(id);
        if (result.error) throw new Error(result.error.message);
        const next = result.data as ControlStatus;
        deadline.current = started + next.remainingSeconds * 1000;
        owns.current = next.ownsControl && Date.now() < deadline.current;
        setStatus({ ...next, ownsControl: owns.current });
        setError("");
      } catch (failure) {
        if (!cancelled) {
          owns.current = false;
          setStatus((previous) => previous ? { ...previous, ownsControl: false } : null);
          setError(failure instanceof Error ? failure.message : "Unable to confirm timing control. Saving is paused.");
        }
      } finally { if (!cancelled) inFlight.current = false; }
    }
    void check();
    const poll = window.setInterval(() => void check(), 20000);
    const expire = window.setInterval(() => {
      if (owns.current && Date.now() >= deadline.current) {
        owns.current = false;
        setStatus((previous) => previous ? { ...previous, ownsControl: false } : null);
        setError("Timing control expired. Your unsaved readings are still here. Reconnect and take control before saving.");
      }
    }, 1000);
    return () => {
      cancelled = true; alive.current = false; inFlight.current = false;
      window.clearInterval(poll); window.clearInterval(expire);
      if (owns.current) {
        owns.current = false;
        void db.rpc("manage_roping_timing", { target_roping: ropingId, browser_session: id, operation: "release" });
      }
    };
  }, [ropingId, enabled]);

  async function operate(operation: "claim" | "release" | "takeover") {
    if (inFlight.current || !sessionId || !confirmDeskNavigation()) return;
    if (operation === "takeover" && !window.confirm("Take over this roping's timing desk? The current timer will no longer be able to save.")) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const started = Date.now();
      const result = await createClient().rpc("manage_roping_timing", { target_roping: ropingId, browser_session: sessionId, operation, takeover_reason: operation === "takeover" ? reason.trim() : null });
      if (!alive.current) return;
      if (result.error) throw new Error(result.error.message);
      const next = result.data as ControlStatus;
      deadline.current = started + next.remainingSeconds * 1000;
      owns.current = next.ownsControl && Date.now() < deadline.current;
      setStatus({ ...next, ownsControl: owns.current });
      setError(""); setTakeover(false); setReason("");
    } catch (failure) {
      owns.current = false;
      setStatus((previous) => previous ? { ...previous, ownsControl: false } : null);
      setError(failure instanceof Error ? failure.message : "Unable to change timing control.");
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }

  const canWrite = enabled && Boolean(status?.ownsControl) && !busy;
  return <TimingContext.Provider value={{ sessionId, canWrite }}>
    {enabled ? <section aria-label="Timing control" className={`space-y-3 border-l-4 px-4 py-3 ${canWrite ? "border-emerald-600 bg-emerald-50" : "border-amber-500 bg-amber-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="flex items-center gap-2 text-sm font-semibold">{busy ? <LoaderCircle size={18} className="animate-spin" /> : canWrite ? <Radio size={18} /> : <LockKeyhole size={18} />}
          {canWrite ? "You have timing control" : status?.holder ? `View only · ${status.holder} has timing control` : sessionId ? "View only · Take control to record times" : "Checking timing control..."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !sessionId || Boolean(status?.holder && !canWrite)} onClick={() => void operate(canWrite ? "release" : "claim")} className="inline-flex h-10 items-center gap-2 rounded-md border border-current bg-white px-3 text-sm font-semibold disabled:opacity-40"><LockKeyhole size={16} />{canWrite ? "Release control" : "Take timing control"}</button>
          {canTakeover && status?.holder && !canWrite ? <button type="button" disabled={busy} onClick={() => setTakeover(!takeover)} className="h-10 rounded-md border border-amber-700 px-3 text-sm font-semibold">Take over</button> : null}
        </div>
      </div>
      {takeover ? <form onSubmit={(event) => { event.preventDefault(); void operate("takeover"); }} className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-sm font-semibold">Takeover reason<input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={300} className="h-10 w-80 max-w-full rounded-md border bg-white px-3 font-normal" /></label><button disabled={busy} className="h-10 rounded-md bg-amber-800 px-3 text-sm font-semibold text-white">Confirm takeover</button></form> : null}
      {error ? <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p> : null}
    </section> : null}
    {children}
  </TimingContext.Provider>;
}
