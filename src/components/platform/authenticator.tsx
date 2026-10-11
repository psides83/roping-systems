"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Plus, RefreshCw, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string; status: string };
type Enrollment = { id: string; qr: string; secret: string };

export function PlatformAuthenticator({ manage = false }: { manage?: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("Primary authenticator");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function readFactors() {
    const db = createClient();
    const result = await db.auth.mfa.listFactors();
    if (result.error) throw new Error(result.error.message);
    const totp = result.data.all.filter((factor) => factor.factor_type === "totp");
    setFactors(totp);
    setFactorId(totp.find((factor) => factor.status === "verified")?.id ?? "");
    if (totp.some((factor) => factor.status === "verified")) setName("Backup authenticator");
  }
  useEffect(() => {
    let cancelled = false;
    const db = createClient();
    db.auth.mfa.listFactors().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setMessage(error.message); return; }
      const totp = data.all.filter((factor) => factor.factor_type === "totp");
      setFactors(totp);
      setFactorId(totp.find((factor) => factor.status === "verified")?.id ?? "");
      if (totp.some((factor) => factor.status === "verified")) setName("Backup authenticator");
    }).catch(() => { if (!cancelled) setMessage("Unable to load authenticators. Try again."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to complete this request. Try again."); }
    finally { setBusy(false); }
  }
  async function enroll() {
    await run(async () => {
      const db = createClient();
      if (manage) {
        const assurance = await db.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("Verify your current authenticator before adding a backup. Open Platform Admin again to verify.");
      }
      const result = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: name.trim(), issuer: "Roping Systems" });
      if (result.error) throw new Error(result.error.message);
      setEnrollment({ id: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret });
      setCode("");
    });
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your authenticator.");
      const db = createClient();
      const result = await db.auth.mfa.challengeAndVerify({ factorId: enrollment?.id ?? factorId, code });
      if (result.error) throw new Error("That code could not be verified. Use the current code from the selected authenticator and try again.");
      setEnrollment(null); setCode("");
      const recorded = await db.rpc("record_platform_verified_session");
      if (recorded.error) throw new Error("Your authenticator was verified, but the security record could not be saved. Reload and try again.");
      window.location.assign(manage ? "/platform/security" : "/platform");
    });
  }
  const verified = factors.filter((factor) => factor.status === "verified");
  return <section className="space-y-5" aria-busy={busy || loading}>
    {loading ? <p role="status" className="flex items-center gap-2 py-6"><LoaderCircle size={20} className="animate-spin" />Loading security settings…</p> : <>
      {message && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}<button type="button" disabled={busy} onClick={() => run(readFactors)} className="ml-3 inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={14} />Retry</button></div>}
      {manage && <div><h2 className="text-lg font-bold">Authenticators</h2><ul className="mt-3 divide-y divide-[#dfe4e1]">{verified.map((factor, index) => <li key={factor.id} className="flex items-center gap-2 py-3 text-sm"><ShieldCheck size={18} className="text-[#00835d]" />{factor.friendly_name || `Authenticator ${index + 1}`}<span className="text-xs text-[#66716b]">Verified</span></li>)}</ul></div>}
      {!enrollment && (manage || !verified.length) && <div className="space-y-3"><label className="block text-sm font-semibold">Authenticator name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} disabled={busy} className="mt-1 block h-10 w-72 max-w-full rounded-md border border-[#ccd4d0] px-3 font-normal" /></label><button type="button" onClick={enroll} disabled={busy || !name.trim()} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus size={16} />{busy ? "Setting up…" : verified.length ? "Add backup authenticator" : "Set up authenticator"}</button></div>}
      {enrollment && <div className="space-y-3"><p className="text-sm leading-6">Scan this code with your authenticator, then enter its six-digit code below.</p>{/* Supabase supplies the QR image; never persist the enrollment secret. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qr.startsWith("data:") ? enrollment.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`} alt="Authenticator setup QR code" width={220} height={220} className="max-w-full bg-white" />
        <details><summary className="cursor-pointer text-sm font-semibold">Enter setup key manually</summary><p className="mt-2 break-all font-mono text-sm select-all">{enrollment.secret}</p></details>
        <button type="button" disabled={busy} onClick={() => run(async () => { const result = await createClient().auth.mfa.unenroll({ factorId: enrollment.id }); if (result.error) throw new Error(result.error.message); setEnrollment(null); setCode(""); await readFactors(); })} className="text-sm font-semibold underline">Cancel unfinished setup</button>
      </div>}
      {(enrollment || (!manage && verified.length > 0)) && <form onSubmit={verify} className="space-y-3">{!enrollment && verified.length > 1 && <label className="block text-sm font-semibold">Authenticator<select value={factorId} onChange={(event) => { setFactorId(event.target.value); setCode(""); }} disabled={busy} className="mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] px-3">{verified.map((factor,index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}</select></label>}<label className="block text-sm font-semibold">Verification code<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0,6))} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} className="mt-1 block h-11 w-44 rounded-md border border-[#ccd4d0] px-3 font-mono text-lg" /></label><button disabled={busy || code.length !== 6} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? "Verifying…" : enrollment ? "Verify authenticator" : "Continue to Platform Admin"}</button></form>}
      {factors.filter((factor) => factor.status !== "verified").map((factor) => <div key={factor.id} className="text-sm"><span>Unfinished setup: {factor.friendly_name || "Authenticator"}</span><button type="button" disabled={busy} onClick={() => run(async () => { const result = await createClient().auth.mfa.unenroll({ factorId: factor.id }); if (result.error) throw new Error(result.error.message); if (enrollment?.id === factor.id) setEnrollment(null); await readFactors(); })} className="ml-3 font-semibold underline">Remove unfinished setup</button></div>)}
    </>}
    <details className="border-t border-[#dfe4e1] pt-4 text-sm"><summary className="cursor-pointer font-semibold">Lost access to your authenticator?</summary><p className="mt-2 leading-6 text-[#66716b]">Use a verified backup authenticator if available. Otherwise, recovery requires access to the Supabase project administration for this app to reset the lost factor. A password reset alone does not bypass two-factor verification. No producer staff member can reset Platform Owner access.</p></details>
  </section>;
}
