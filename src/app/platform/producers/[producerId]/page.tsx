import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { z } from "zod";
import { readPlatformProducer, platformAdminClient } from "@/lib/platform-admin-data";
import { ProducerLifecycle, type ProducerExportRecord } from "@/components/platform/lifecycle";
import { ProducerOnboardingReview } from "@/components/platform/onboarding-review";
import { AccountStatusBadge } from "@/components/platform/status-badge";
import { ArchiveContact, ContactDialog, CopyInvitationLink, PlatformAccountForm, PlatformNoteForm } from "@/components/platform/account-forms";
import { formatPhoneNumber } from "@/lib/utils";

function timestamp(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value)); }
export default async function ProducerAccountPage({ params, searchParams }: PageProps<"/platform/producers/[producerId]">) {
  const { producerId } = await params;
  if (!z.uuid().safeParse(producerId).success) notFound();
  const query = await searchParams;
  const tab = typeof query.tab === "string" && ["contacts","onboarding","notes","lifecycle"].includes(query.tab) ? query.tab : "account";
  const detail = await readPlatformProducer(producerId);
  if (!detail) notFound();
  const base = `/platform/producers/${producerId}`;
  let exports: ProducerExportRecord[] = [];
  if (tab === "lifecycle") {
    const db = await platformAdminClient();
    const result = await db.from("platform_producer_exports").select("id,status,reason,created_at,byte_count,sha256").eq("producer_id",producerId).order("created_at",{ascending:false}).limit(20);
    if (result.error) throw new Error("Unable to load producer exports.");
    exports = result.data;
  }
  return <div className="space-y-6">
    <nav className="text-sm text-[#66716b]"><Link href="/platform" className="underline">Producer accounts</Link> / {detail.producer.name}</nav>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{detail.producer.name}</h1><AccountStatusBadge status={detail.account.status} /></div><p className="mt-2 break-all text-sm text-[#66716b]">/public/{detail.producer.slug}</p></div><Link href={`/public/${detail.producer.slug}`} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><ExternalLink size={16} />Public page</Link></header>
    <nav aria-label="Producer account sections" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[#dfe4e1]">{Object.entries({ account: "Account", contacts: "Contacts & access", onboarding: "Onboarding", notes: "Notes & history", lifecycle: "Data lifecycle" }).map(([key,label]) => <Link key={key} href={`${base}?tab=${key}`} aria-current={tab===key ? "page" : undefined} className={`border-b-2 py-3 text-sm font-semibold ${tab===key ? "border-[#3146a8] text-[#3146a8]" : "border-transparent text-[#66716b]"}`}>{label}</Link>)}</nav>
    {tab === "account" && <section className="space-y-6"><div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#66716b]"><p>Created {timestamp(detail.producer.created_at)}</p><p>Event timezone: {detail.producer.timezone}</p>{detail.account.approved_at && <p>Approved {timestamp(detail.account.approved_at)}</p>}</div><PlatformAccountForm key={detail.account.updated_at} detail={detail} /></section>}
    {tab === "contacts" && <div className="space-y-7">
      <section><header className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Account contacts</h2><ContactDialog producerId={producerId} /></header>
        <div className="divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{detail.contacts.filter((c) => !c.archived_at).map((contact) => <article key={contact.id} className="flex flex-wrap items-start justify-between gap-4 py-4"><div className="min-w-0"><h3 className="font-semibold">{contact.name}{contact.is_primary && <span className="ml-2 text-xs text-[#3146a8]">Primary contact</span>}</h3><p className="mt-1 text-sm text-[#66716b]">{contact.responsibility}</p><div className="mt-2 flex flex-wrap gap-4 text-sm">{contact.email && <a href={`mailto:${contact.email}`} className="break-all underline">{contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`} className="underline">{formatPhoneNumber(contact.phone)}</a>}</div></div><div className="flex flex-wrap items-start gap-2"><ContactDialog producerId={producerId} contact={contact} /><ArchiveContact producerId={producerId} contactId={contact.id} /></div></article>)}</div>
        {!detail.contacts.some((c) => !c.archived_at) && <p className="py-4 text-sm text-[#66716b]">No account contacts yet.</p>}
        {detail.contacts.some((c) => c.archived_at) && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold text-[#66716b]">Archived contacts</summary><div className="mt-2 space-y-2">{detail.contacts.filter((c) => c.archived_at).map((c) => <p key={c.id}>{c.name} · {c.email ?? formatPhoneNumber(c.phone)}</p>)}</div></details>}
      </section>
      <section><h2 className="text-lg font-bold">Staff access</h2><div className="mt-3 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{detail.staff.map((staff) => <div key={staff.email} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><div><p className="font-semibold">{staff.name || staff.email}</p>{staff.name && <p className="mt-1 break-all text-[#66716b]">{staff.email}</p>}</div><span className="capitalize text-[#66716b]">{staff.role.replaceAll("_"," ")}</span></div>)}</div></section>
      <section className="space-y-4"><h2 className="text-lg font-bold">Outstanding invitations</h2>{detail.invitations.map((i) => <div key={`${i.email}-${i.role}`} className="border-b border-[#dfe4e1] pb-3 text-sm"><p className="break-all font-semibold">{i.email}</p><p className="mt-1 text-[#66716b]">{i.role} · {i.expired ? "Expired" : "Expires"} {timestamp(i.expires_at)} · {i.email_status.replaceAll("_"," ")}</p></div>)}{!detail.invitations.length ? <p className="text-sm text-[#66716b]">No outstanding invitations.</p> : <><p className="text-sm leading-6 text-[#66716b]">Send this link to the invited person. They can create a login and must use the invited email address. {detail.account.status === "pending" && "Approve this account before they accept the invitation."}</p><div className="flex flex-wrap items-center gap-4"><CopyInvitationLink /><Link href="/staff-invitations" target="_blank" rel="noopener noreferrer" className="text-sm underline">Invitation page</Link></div></>}</section>
    </div>}
    {tab === "onboarding" && <ProducerOnboardingReview detail={detail} />}
    {tab === "lifecycle" && <ProducerLifecycle producerId={producerId} exports={exports} />}
    {tab === "notes" && <div className="space-y-8"><PlatformNoteForm producerId={producerId} />
      <section><h2 className="text-lg font-bold">Private notes</h2><div className="mt-3 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{detail.notes.map((note) => <article key={note.id} className="py-4"><p className="whitespace-pre-wrap break-words text-sm leading-6">{note.body}</p><p className="mt-2 break-all text-xs text-[#66716b]">{note.author} · {timestamp(note.created_at)}</p></article>)}</div>{!detail.notes.length && <p className="mt-3 text-sm text-[#66716b]">No notes yet.</p>}</section>
      <section><h2 className="text-lg font-bold">Account history</h2><div className="mt-3 divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{detail.history.map((entry) => <article key={entry.id} className="py-3"><p className="text-sm font-semibold">{entry.action}</p>{entry.reason && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.reason}</p>}{Boolean(entry.details.from) && <p className="mt-1 text-xs text-[#66716b]">{String(entry.details.from)} to {String(entry.details.to)}</p>}<p className="mt-1 break-all text-xs text-[#66716b]">{entry.actor ?? "Platform"} · {timestamp(entry.created_at)}</p></article>)}</div></section>
    </div>}
  </div>;
}
