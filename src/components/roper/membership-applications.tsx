import Link from "next/link";
import type { PortalMembership } from "@/lib/roper-portal";
import type { PortalMembershipApplications } from "@/lib/roper-memberships";

export function MembershipApplications({ data, memberships }: { data: PortalMembershipApplications; memberships: PortalMembership[] }) {
  return <div className="space-y-7">
    <section className="space-y-3"><h2 className="text-lg font-bold">Memberships & renewals</h2>
      {memberships.map((m) => { const available = data.forms.some((f) => f.producerSlug === m.producerSlug); const pending = data.applications.some((a) => a.producerSlug === m.producerSlug && a.status === "pending"); return <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4e1] py-3"><div><p className="font-semibold">{m.producerName} · #{m.memberNumber}</p><p className="text-sm text-[#66716b]"><span className="capitalize">{m.status}</span>{m.expiresOn ? ` · Expires ${m.expiresOn}` : " · No expiration recorded"}</p></div>{pending ? <span className="text-sm font-semibold text-amber-800">Awaiting review</span> : available ? <Link href={`/public/${m.producerSlug}/membership?member=${m.id}`} className="rounded-md border border-[#ccd4d0] px-3 py-2 text-sm font-semibold">Request renewal</Link> : <p className="text-sm text-[#66716b]">Contact producer to renew</p>}</div>; })}
      {!memberships.length ? <p className="text-sm text-[#66716b]">No linked memberships yet.</p> : null}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Applications</h2><p className="max-w-2xl text-sm text-[#66716b]">Only applications submitted while signed in appear here. Membership fees and payment arrangements are handled by the producer.</p>
      {data.applications.map((a) => <div key={a.id} className="flex flex-wrap justify-between gap-3 border-b border-[#dfe4e1] py-3 text-sm"><div><p className="font-semibold">{a.producerName} · {a.kind === "renewal" ? "Renewal" : "Membership application"}</p><p className="mt-1 text-[#66716b]">Submitted {a.submittedAt.slice(0, 10)}</p>{a.status === "approved" ? <p className="mt-1 text-emerald-800">Your membership is connected to your portal.</p> : a.status === "declined" ? <p className="mt-1 text-[#66716b]">Contact the producer for follow-up.</p> : null}</div><span className="font-semibold capitalize">{a.status}</span></div>)}
      {!data.applications.length ? <p className="text-sm text-[#66716b]">No applications submitted through this account.</p> : null}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Apply with another producer</h2><div className="flex flex-wrap gap-3">{data.forms.filter((f) => !memberships.some((m) => m.producerSlug === f.producerSlug) && !data.applications.some((a) => a.producerSlug === f.producerSlug && a.status === "pending")).map((f) => <Link key={f.producerSlug} href={`/public/${f.producerSlug}/membership`} className="rounded-md border border-[#ccd4d0] px-3 py-2 text-sm font-semibold">{f.producerName}</Link>)}</div>{!data.forms.length ? <p className="text-sm text-[#66716b]">No online membership forms are currently published.</p> : null}</section>
  </div>;
}
