import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDashed, CircleAlert } from "lucide-react";
import { setupChecklistSummary, type ChecklistItem } from "@/lib/producer-setup";

const statusLabels = { ready: "Ready", attention: "Needs attention", optional: "Optional" };
const statusClasses = { ready: "bg-emerald-50 text-emerald-800", attention: "bg-amber-50 text-amber-900", optional: "bg-[#eef1ef] text-[#56615b]" };
const icons = { ready: CheckCircle2, attention: CircleAlert, optional: CircleDashed };
const groups = [{ id: "competition", title: "Competition setup" }, { id: "membership", title: "Membership & seasons" }, { id: "qualification", title: "Qualified events" }] as const;

export function ProducerSetupChecklist({ items }: { items: ChecklistItem[] }) {
  const summary = setupChecklistSummary(items);
  return <div className="space-y-7 break-words">
    <section aria-label="Setup progress" className="border-y border-[#d7ddda] py-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-base font-bold">{summary.ready} of {summary.total} setup checks ready</p><div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded bg-amber-50 px-2.5 py-1.5 text-amber-900">{summary.attention} need attention</span><span className="rounded bg-[#eef1ef] px-2.5 py-1.5 text-[#56615b]">{summary.optional} optional</span></div></div>
      <div role="progressbar" aria-label="Producer setup progress" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.ready} aria-valuetext={`${summary.ready} of ${summary.total} setup checks ready`} className="mt-4 h-2 overflow-hidden rounded bg-[#e4e9e6]"><div className="h-full bg-emerald-600 transition-[width] motion-reduce:transition-none" style={{ width: `${summary.total ? summary.ready / summary.total * 100 : 100}%` }} /></div>
      {summary.next ? <Link href={summary.next.href} className="mt-4 inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-semibold text-[var(--brand-accent-strong)]"><span>Next step: {summary.next.title}</span><ArrowRight size={17} className="shrink-0" /></Link> : <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={18} />Your setup checks are ready.</p>}
    </section>
    {groups.filter(group => items.some(item => item.group === group.id)).map((group) => <section key={group.id} aria-labelledby={`setup-${group.id}`}><h2 id={`setup-${group.id}`} className="mb-1 text-base font-bold">{group.title}</h2><div className="divide-y divide-[#dfe4e1]">
      {items.filter((item) => item.group === group.id).map((item) => {
        const Icon = icons[item.status];
        return <article key={item.id} className="py-4">
          <div className="flex items-start gap-3"><Icon size={21} className={`mt-1 shrink-0 ${item.status === "ready" ? "text-emerald-700" : item.status === "attention" ? "text-amber-700" : "text-[#758078]"}`} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><Link href={item.href} className="text-sm font-bold hover:underline">{item.title}</Link><span className={`rounded px-2 py-1 text-[11px] font-semibold ${statusClasses[item.status]}`}>{statusLabels[item.status]}</span></div><p className="mt-2 text-sm leading-5 text-[#66716b]">{item.detail}</p></div><Link href={item.href} aria-label={`${item.status === "ready" ? "Review" : "Set up"} ${item.title.toLowerCase()}`} title={`Open ${item.title.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[#ccd4d0] bg-white hover:bg-[#f7f8f7]"><ArrowRight size={18} /></Link></div>
          {item.issues.length ? <details className="group/issues ml-8 mt-3"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-amber-900 [&::-webkit-details-marker]:hidden">{item.issues.length} {item.issues.length === 1 ? "item" : "items"} to review<ChevronDown size={15} className="transition-transform group-open/issues:rotate-180 motion-reduce:transition-none" /></summary><ul className="space-y-3 pb-1 text-sm leading-5">{item.issues.map((issue, index) => <li key={index} className="border-l-2 border-amber-300 pl-3"><p>{issue.message}</p><Link href={issue.href} className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--brand-accent-strong)]">Review setting<ArrowRight size={13} /></Link></li>)}</ul></details> : null}
        </article>;
      })}
    </div></section>)}
  </div>;
}
