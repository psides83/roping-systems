import Link from "next/link";
import { formatCurrencyExact } from "@/lib/utils";
import type { CloseoutReviewItem } from "@/lib/events/closeout-review";

export function CloseoutReview({ items }: { items: CloseoutReviewItem[] }) {
  return <section aria-labelledby="closeout-review-title" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="closeout-review-title" className="text-lg font-bold">Closeout review</h2><span className={`rounded-full px-3 py-1 text-sm font-semibold ${items.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{items.length ? `${items.length} review ${items.length === 1 ? "item" : "items"}` : "No review items found"}</span></div>
    <p className="text-sm leading-6 text-[#526059]">Use these links to review the underlying records. This report does not finalize the event or change any payment.</p>
    {items.length ? <ul className="grid gap-3 lg:grid-cols-2">{items.map(item => <li key={item.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-bold">{item.title}</h3>{item.amountCents !== undefined ? <span className="font-mono text-sm font-bold tabular-nums">{formatCurrencyExact(item.amountCents)}</span> : null}</div>
      <p className="text-sm leading-6 text-[#526059]">{item.detail}</p><Link href={item.href} className="mt-auto inline-flex min-h-11 items-center self-start rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold hover:bg-[#f4f6f5]">{item.action}</Link>
    </li>)}</ul> : <p className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">The loaded records show no outstanding review items. Check your physical cash, payment methods, and any records outside this app separately.</p>}
  </section>;
}
