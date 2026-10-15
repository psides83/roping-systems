import Link from "next/link";
import { CircleHelp, ExternalLink } from "lucide-react";

export function HelpLink({ guide, label = "How this works", compact = false }: { guide: string; label?: string; compact?: boolean }) {
  return <Link href={`/help/${guide}`} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-[#66716b] hover:bg-[#eef1ef] hover:text-[#17201c] focus-visible:outline-2 focus-visible:outline-offset-2 ${compact ? "justify-center sm:justify-start" : ""}`}>
    <CircleHelp size={17} aria-hidden="true" /><span className={compact ? "sr-only sm:not-sr-only" : undefined}>{label}</span><ExternalLink size={13} aria-hidden="true" className={compact ? "hidden sm:block" : undefined} /><span className="sr-only"> (opens in a new tab)</span>
  </Link>;
}
