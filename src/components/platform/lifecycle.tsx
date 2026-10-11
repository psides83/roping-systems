"use client";
import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export interface ProducerExportRecord { id: string; status: string; reason: string; created_at: string; byte_count: number | null; sha256: string | null }
export function ProducerLifecycle({ producerId, exports }: { producerId: string; exports: ProducerExportRecord[] }) {
  const router = useRouter();
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState<string | null>(null);
  const [message,setMessage] = useState("");
  const [link,setLink] = useState<string | null>(null);
  async function requestExport(id?: string) {
    if (busy) return;
    setBusy(id ?? "create"); setMessage(""); setLink(null);
    try {
      const response = await fetch(`/api/platform/producers/${producerId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { operation: "download", id } : { operation: "create", reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setLink(result.url); setMessage(result.message);
    } catch(error) { setMessage(error instanceof Error ? error.message : "Unable to prepare the export. Try again."); }
    finally { setBusy(null); router.refresh(); }
  }
  return <section className="space-y-7">
    <header><h2 className="text-lg font-bold">Producer data export</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716b]">Download setup, roper records, events, results, financial records, and uploaded logos in one ZIP. Records include JSON and spreadsheet-friendly CSV copies. External flyer links are references; credentials and private platform notes are excluded. This is a data archive, not an automatic restore tool.</p></header>
    <form onSubmit={(event) => { event.preventDefault(); requestExport(); }} className="space-y-3"><label className="block text-sm font-semibold">Reason for export<input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={5} maxLength={1000} disabled={Boolean(busy)} className="mt-1 block h-10 w-full max-w-lg rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal" /></label><button disabled={Boolean(busy) || reason.trim().length<5} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{busy === "create" ? "Preparing archive…" : "Prepare export"}</button></form>
    {busy && <p role="status" className="text-sm font-semibold">{busy === "create" ? "Collecting records and uploads. Keep this page open until the archive is ready." : "Creating a secure download link…"}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}{link && <a href={link} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold"><Download size={16} />Download ZIP</a>}
    <p className="border-l-4 border-amber-400 pl-3 text-sm leading-6 text-[#66716b]">Exports contain personal and financial information. Download links expire after five minutes. Prepared archives remain in private storage; they are not automatically deleted. Store downloaded copies securely.</p>
    <section><h3 className="font-semibold">Recent exports</h3><div className="mt-3 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{exports.map((entry) => <article key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(entry.created_at))} · {entry.status === "ready" ? "Prepared" : entry.status === "generating" ? "Preparing" : entry.status === "removed" ? "Removed" : "Failed"}</p><p className="mt-1 break-words text-sm text-[#66716b]">{entry.reason}</p>{entry.byte_count !== null && <p className="mt-1 text-xs text-[#66716b]">{(entry.byte_count / 1024 / 1024).toFixed(2)} MB</p>}{entry.sha256 && <details className="mt-2 text-xs"><summary className="cursor-pointer">Archive checksum</summary><p className="mt-1 break-all font-mono">{entry.sha256}</p></details>}</div>{entry.status === "ready" && <button type="button" onClick={() => requestExport(entry.id)} disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-50">{busy === entry.id ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}Download</button>}</article>)}</div>{!exports.length && <p className="mt-3 text-sm text-[#66716b]">No exports have been requested.</p>}</section>
    <section className="border-t border-[#dfe4e1] pt-5"><h3 className="font-semibold">Archive and restore</h3><p className="mt-2 text-sm leading-6 text-[#66716b]">Use Account status to archive this producer. Records and staff assignments are retained, but workspace access is blocked. Choose whether to unpublish their events when archiving. Public rules, bulletins, and producer information remain available. Restoring access does not republish hidden events.</p></section>
  </section>;
}
