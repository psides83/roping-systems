"use client";
import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";

export function ReportDownload({ href, disabled }: { href: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setPending(true); setError("");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("text/csv")) throw new Error("Unable to download this report. Refresh and try again.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "producer-report.csv";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to download report."); }
    finally { setPending(false); }
  }
  return <div><button type="button" onClick={download} disabled={disabled || pending} aria-busy={pending} className="inline-flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50">
    {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}{pending ? "Preparing export…" : "Download CSV"}</button>
    <span role="status" className="sr-only">{pending ? "Preparing report download" : ""}</span>{error && <p role="alert" className="mt-2 max-w-sm text-sm text-red-700">{error}</p>}</div>;
}
