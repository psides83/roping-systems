import Link from "next/link";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";

export function EventSummaryCard({ icon: Icon, label, value, detail, href, newTab = false, breakdown }: {
  icon: LucideIcon; label: string; value?: string; detail?: string; href: string; newTab?: boolean;
  breakdown?: Array<{ label: string; value: string }>;
}) {
  return <Link href={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}
    className="group flex min-w-0 flex-col rounded-md border border-[#dfe4e1] bg-white p-4 transition-colors hover:border-[var(--brand-accent)] hover:bg-[#fafbfa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]">
    <div className="flex items-center gap-2 text-[#66716b]"><Icon size={17} className="shrink-0" aria-hidden="true" /><h2 className="flex-1 text-sm font-semibold">{label}</h2>
      {newTab ? <ArrowUpRight size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />}
      {newTab ? <span className="sr-only">Opens in a new tab</span> : null}
    </div>
    {value !== undefined ? <p className="mt-3 break-words text-xl font-bold tabular-nums">{value}</p> : null}
    {breakdown ? <dl className="mt-3 space-y-1.5">{breakdown.map((item) => <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"><dt className="text-[#66716b]">{item.label}</dt><dd className="font-semibold tabular-nums">{item.value}</dd></div>)}</dl> : null}
    {detail ? <p className="mt-2 text-xs leading-5 text-[#758078]">{detail}</p> : null}
  </Link>;
}
