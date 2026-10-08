"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function PrivateReceiptCode({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  return <div className="w-96 max-w-full">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">Private receipt code</span>
      <button type="button" title="Copy receipt code" aria-label="Copy receipt code" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#ccd4d0]" onClick={async () => {
        try { await navigator.clipboard.writeText(code); setMessage("Receipt code copied."); }
        catch { setMessage("Select the receipt code below to copy it."); }
      }}>{message === "Receipt code copied." ? <Check size={15} /> : <Copy size={15} />}</button>
    </div>
    <textarea aria-label="Private receipt code" readOnly rows={3} value={code} className="mt-2 w-full rounded-md border border-[#ccd4d0] p-3 font-mono text-xs" />
    {message && <p role="status" className="mt-1 text-xs text-[#66716b]">{message}</p>}
  </div>;
}
