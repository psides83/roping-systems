"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { historyRecords, reverseHistory } from "@/app/(app)/settings/migration/actions";

interface Batch { id: string; file_name: string; kind: string; source_note: string; created_at: string; reversed_at: string | null; reversal_reason: string | null }
export function HistoryImportLog({ batches, canStandings, canFunds }: { batches: Batch[]; canStandings: boolean; canFunds: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [records, setRecords] = useState<Record<string, Awaited<ReturnType<typeof historyRecords>>>>({});
  const [loading, setLoading] = useState<string | null>(null);
  async function load(id: string) {
    setLoading(id); setError("");
    try { const rows = await historyRecords(id); setRecords((old) => ({ ...old, [id]: rows })); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load records."); }
    finally { setLoading(null); }
  }
  async function reverse() {
    if (!target) return;
    setBusy(true); setError("");
    try { await reverseHistory(target, reason); setTarget(null); setReason(""); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to reverse import."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 border-t pt-5"><h2 className="font-semibold">Recent imports</h2>
    {!batches.length && <p className="text-sm text-[#66716b]">No historical imports yet.</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {batches.map((b) => <details key={b.id} className="border-b pb-3"><summary className="cursor-pointer text-sm"><strong>{b.file_name}</strong> · {b.kind} · {b.created_at.slice(0, 10)} · {b.reversed_at ? "Reversed" : "Imported"}</summary>
      <p className="my-3 text-sm">{b.source_note}</p>
      {!records[b.id] ? <button className="mb-3 rounded-md border px-3 py-2 text-sm" disabled={Boolean(loading)} onClick={() => void load(b.id)}>{loading === b.id ? "Loading imported records..." : "View imported records"}</button> : <div className="mb-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Row", "Member / fund", "Reference", "Date", "Value"].map((h) => <th className="border-b p-2" key={h}>{h}</th>)}</tr></thead><tbody>{records[b.id].map((r) => <tr key={r.row}><td className="p-2">{r.row}</td><td className="p-2">{r.name}</td><td className="p-2">{r.reference}</td><td className="whitespace-nowrap p-2">{r.date}</td><td className="p-2">{b.kind === "attendance" ? `${r.count} ropings` : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(r.amountCents / 100)}</td></tr>)}</tbody></table></div>}
      {b.reversed_at ? <p className="text-sm">{b.reversal_reason}</p> : (b.kind === "fund" ? canFunds : canStandings) && <button className="rounded-md border px-3 py-2 text-sm" disabled={busy} onClick={() => { setTarget(b.id); setReason(""); setError(""); }}>Reverse import</button>}
      {target === b.id && <div className="mt-3 flex flex-wrap items-center gap-3"><label className="text-sm">Reason<input className="ml-2 max-w-full rounded-md border px-3 py-2" value={reason} disabled={busy} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy || reason.trim().length < 5} className="rounded-md bg-red-700 px-3 py-2 text-sm text-white" onClick={() => void reverse()}>{busy ? "Reversing..." : "Confirm reversal"}</button><button disabled={busy} onClick={() => setTarget(null)}>Cancel</button></div>}
    </details>)}
  </section>;
}
