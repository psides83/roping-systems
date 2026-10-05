import { LoaderCircle } from "lucide-react";

export function LoadingNotice({ label = "Loading page", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`overflow-hidden rounded-md border border-[#c5cec9] bg-white shadow-sm ${compact ? "w-full" : "mb-6"}`}>
    <div className={`flex items-center gap-4 ${compact ? "px-5 py-4" : "px-5 py-7 sm:px-7"}`}>
      <LoaderCircle size={compact ? 28 : 36} aria-hidden="true" className="loading-spinner shrink-0 text-[var(--brand-accent)]" />
      <div className="min-w-0"><p className={`${compact ? "text-base" : "text-lg"} font-bold text-[#17201c]`}>{label}...</p>
        {!compact ? <p className="mt-1 text-sm text-[#66716b]">Please wait while we load your view.</p> : null}</div>
    </div>
    <div aria-hidden="true" className="loading-progress h-1 overflow-hidden bg-[#e7ebe8]"><span className="block h-full w-1/3 bg-[var(--brand-accent)]" /></div>
  </div>;
}
