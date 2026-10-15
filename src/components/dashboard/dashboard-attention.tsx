"use client";

import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

export function DashboardAttention({ pendingMembers, unpaidEvents }: {
  pendingMembers: number;
  unpaidEvents: { id: string; title: string; count: number }[];
}) {
  const showMemberships = featureEnabled(useProducerFeatures(), "require_memberships");
  if (!(showMemberships && pendingMembers > 0) && !unpaidEvents.length) return null;
  return (<section aria-labelledby="attention-title" className="rounded-lg border border-[#dfe4e1] bg-white p-5">
      <div className="flex items-center gap-2"><Clock3 size={18} className="text-[var(--brand-accent-strong)]" /><h2 id="attention-title" className="font-bold">Needs attention</h2></div>
      <div className="mt-3 divide-y divide-[#e7ebe8]">
        {showMemberships && pendingMembers > 0 && <Link href="/members?status=pending" className="flex min-h-14 items-center justify-between gap-4 py-3 hover:text-[var(--brand-accent-strong)]"><div><p className="text-sm font-semibold">{pendingMembers} {pendingMembers === 1 ? "membership needs" : "memberships need"} review</p><p className="mt-1 text-sm text-[#66716b]">Review pending applications and approvals.</p></div><ArrowRight size={18} className="shrink-0" /></Link>}
        {unpaidEvents.map(event => <Link key={event.id} href={`/events/${event.id}/entries?payment=unpaid#entry-ledger`} className="flex min-h-14 items-center justify-between gap-4 py-3 hover:text-[var(--brand-accent-strong)]"><div className="min-w-0"><p className="truncate text-sm font-semibold">{event.title}</p><p className="mt-1 text-sm text-[#66716b]">{event.count} unpaid {event.count === 1 ? "entry" : "entries"} · Review payments</p></div><ArrowRight size={18} className="shrink-0" /></Link>)}
      </div>
    </section>);
}
