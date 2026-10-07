import { StatusPill } from "@/components/ui/status-pill";
import type { RoperSubmission } from "@/lib/roper-accounts";

export function PortalSubmissions({ submissions, timezone }: { submissions: RoperSubmission[]; timezone: string }) {
  if (!submissions.length) return <p className="py-6 text-sm text-[#66716b]">No linked online entry requests yet.</p>;
  return <section aria-label="Online entry requests" className="divide-y divide-[#dfe4e1]">{submissions.map((submission) => <article key={submission.id} className="space-y-3 py-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{submission.eventTitle}</h2><p className="mt-1 text-xs text-[#66716b]">Submitted {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(submission.submittedAt))}</p></div><StatusPill status={submission.status} /></header>
    <ul className="space-y-2 text-sm">{submission.items.map((item, index) => <li key={`${item.name}:${item.date}:${index}`} className="break-words">{item.name}{item.division && !item.name.toLowerCase().includes(item.division.toLowerCase()) ? ` · ${item.division}` : ""} · {item.date} · {item.quantity} {item.quantity === 1 ? "entry" : "entries"}</li>)}</ul>
    <p className="text-sm text-[#66716b]">{submission.status === "pending" ? "Awaiting producer approval. These are not confirmed entries or charges yet." : submission.status === "accepted" ? "Accepted by the producer. Confirmed entries and current fees are listed separately." : "Declined by the producer. Contact the producer with questions."}</p>
  </article>)}</section>;
}
