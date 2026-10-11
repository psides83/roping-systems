"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, LoaderCircle, Plus, Save, X, Pencil, Archive } from "lucide-react";
import { createPlatformProducer, managePlatformProducer, type PlatformFormState } from "@/app/platform/actions";
import { accountStatuses, accountAvailable, type PlatformContact, type PlatformDetail } from "@/lib/platform-admin";
import { PhoneInput } from "@/components/ui/phone-input";

const input = "mt-1 block h-10 w-full max-w-sm rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal";
const button = "flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#3146a8] px-4 text-sm font-semibold text-white disabled:opacity-50";
function Feedback({ state }: { state: PlatformFormState }) {
  return state.message ? <p role="status" className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p> : null;
}
function Submit({ pending, children = "Save" }: { pending: boolean; children?: React.ReactNode }) {
  return <button disabled={pending} className={button}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{pending ? "Saving..." : children}</button>;
}

export function CreatePlatformProducerForm() {
  const [state, action, pending] = useActionState(createPlatformProducer, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return <form action={action} className="space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-semibold">Producer name<input name="name" value={name} onChange={(event) => { setName(event.target.value); if (!slugEdited) setSlug(slugify(event.target.value)); }} required maxLength={120} className={input} /></label>
      <label className="text-sm font-semibold">Public page address<div className="mt-1 flex h-10 max-w-sm items-center rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal"><span className="text-[#758078]">/public/</span><input name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} required maxLength={100} className="min-w-0 flex-1 outline-none" /></div></label>
      <label className="text-sm font-semibold">Primary contact name<input name="contactName" required maxLength={120} autoComplete="name" className={input} /></label>
      <label className="text-sm font-semibold">Primary administrator email<input name="ownerEmail" type="email" required autoComplete="email" className={input} /></label>
      <label className="text-sm font-semibold">Contact phone <span className="font-normal text-[#758078]">(optional)</span><PhoneInput name="contactPhone" className={input} /></label>
      <label className="text-sm font-semibold">Initial status<select name="status" defaultValue="setup" className={input}><option value="setup">Setup in progress</option><option value="pending">Pending approval</option></select></label>
    </div>
    <p className="text-sm leading-6 text-[#66716b]">The administrator receives an owner invitation, not a shared password. Pending accounts cannot access the producer workspace until approved.</p>
    <Feedback state={state} /><Submit pending={pending}>Create producer</Submit>
  </form>;
}

export function PlatformAccountForm({ detail }: { detail: PlatformDetail }) {
  const [state, action, pending] = useActionState(managePlatformProducer.bind(null, detail.producer.id), {});
  const [status, setStatus] = useState(detail.account.status);
  const changingStatus = status !== detail.account.status;
  return <form action={action} className="space-y-5">
    <input type="hidden" name="operation" value="account" /><input type="hidden" name="expectedUpdatedAt" value={detail.account.updated_at} />
    <input type="hidden" name="expectedProducerUpdatedAt" value={detail.producer.updated_at} />
    <label className="block text-sm font-semibold">Producer name<input name="producerName" defaultValue={detail.producer.name} required minLength={2} maxLength={120} className={input} /></label>
    <div className="flex flex-wrap gap-5">
      <label className="text-sm font-semibold">Account status<select name="status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={input}>{Object.entries(accountStatuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Follow-up date<input name="followUpOn" type="date" defaultValue={detail.account.follow_up_on ?? ""} className={input} /></label>
    </div>
    <label className="block text-sm font-semibold">Next action<input name="nextAction" defaultValue={detail.account.next_action} maxLength={300} className={`${input} max-w-xl`} /></label>
    {changingStatus && <div className={`space-y-3 border-l-4 p-4 ${accountAvailable(status) ? "border-sky-500 bg-sky-50" : "border-rose-500 bg-rose-50"}`}>
      <p className="text-sm font-semibold">{accountAvailable(status) ? "This enables access for the producer's existing staff." : "This blocks the producer workspace and staff changes, including existing signed-in sessions. Records are retained."}</p>
      <label className="block text-sm font-semibold">Reason for status change<textarea name="reason" required minLength={5} maxLength={1000} rows={3} className="mt-1 block w-full max-w-xl rounded-md border border-[#ccd4d0] bg-white p-3 text-sm font-normal" /></label>
      {!accountAvailable(status) && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" required className="mt-1 h-4 w-4 shrink-0" />I understand that staff access will be blocked.</label>}
      {status === "archived" && <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="archiveHideEvents" defaultChecked className="mt-1 h-4 w-4 shrink-0" />Unpublish this producer’s events when archiving.</label><p className="text-xs leading-5 text-[#66716b]">Leave unchecked to keep published schedules and results visible. Rules, bulletins, and producer information stay public. Restoring the account will not republish hidden events.</p></div>}
    </div>}
    {!changingStatus && <input type="hidden" name="reason" value="" />}
    <Feedback state={state} /><Submit pending={pending}>Save account</Submit>
  </form>;
}

export function ContactDialog({ producerId, contact }: { producerId: string; contact?: PlatformContact }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [state, action, pending] = useActionState(managePlatformProducer.bind(null, producerId), {});
  useEffect(() => { if (state.success) { const timer = setTimeout(() => setOpen(false), 0); return () => clearTimeout(timer); } }, [state]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
      if (event.key !== "Tab") return;
      const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not([type="hidden"]),textarea,select') ?? [])];
      const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [open, pending]);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">{contact ? <Pencil size={15} /> : <Plus size={15} />}{contact ? "Edit" : "Add contact"}</button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/45 p-4">
      <button type="button" aria-label="Close contact dialog" disabled={pending} className="absolute inset-0" onClick={() => setOpen(false)} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`contact-title-${contact?.id ?? "new"}`} className="relative my-8 w-full max-w-lg rounded-md bg-white p-5 shadow-xl">
        <header className="mb-5 flex items-center justify-between gap-3"><h2 id={`contact-title-${contact?.id ?? "new"}`} className="text-lg font-bold">{contact ? "Edit contact" : "Add contact"}</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center"><X size={18} /></button></header>
        <form action={action} className="space-y-4"><input type="hidden" name="operation" value="contact" /><input type="hidden" name="id" value={contact?.id ?? ""} />
          <label className="block text-sm font-semibold">Name<input name="name" required maxLength={120} defaultValue={contact?.name} className={input} /></label>
          <label className="block text-sm font-semibold">Email<input name="email" type="email" defaultValue={contact?.email ?? ""} className={input} /></label>
          <label className="block text-sm font-semibold">Phone<PhoneInput name="phone" defaultValue={contact?.phone ?? ""} className={input} /></label>
          <label className="block text-sm font-semibold">Responsibility<input name="responsibility" maxLength={120} defaultValue={contact?.responsibility ?? "Primary"} className={input} /></label>
          <label className="flex items-center gap-2 text-sm"><input name="isPrimary" type="checkbox" defaultChecked={contact?.is_primary} className="h-4 w-4" />Primary contact</label>
          <Feedback state={state} /><div className="flex justify-end gap-3 border-t border-[#e7ebe8] pt-4"><button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold">Cancel</button><Submit pending={pending} /></div>
        </form>
      </section>
    </div>}
  </>;
}

export function ArchiveContact({ producerId, contactId }: { producerId: string; contactId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(managePlatformProducer.bind(null, producerId), {});
  if (!open) return <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-1 px-2 text-sm text-[#66716b]"><Archive size={15} />Archive</button>;
  return <form action={action} className="space-y-2 border-l-2 border-amber-400 pl-3"><input name="operation" type="hidden" value="archive_contact" /><input name="id" type="hidden" value={contactId} /><label className="text-xs font-semibold">Reason<input name="reason" required minLength={5} maxLength={1000} className={input} /></label><Feedback state={state} /><div className="flex gap-3"><Submit pending={pending}>Archive contact</Submit><button type="button" onClick={() => setOpen(false)} className="text-sm">Cancel</button></div></form>;
}

export function OnboardingTaskAction({ producerId, taskKey, completed }: { producerId: string; taskKey: string; completed: boolean }) {
  const [state, action, pending] = useActionState(managePlatformProducer.bind(null, producerId), {});
  return <form action={action}><input name="operation" type="hidden" value="task" /><input name="key" type="hidden" value={taskKey} /><input name="done" type="hidden" value={completed ? "false" : "true"} />
    <button disabled={pending} className={`flex min-h-10 items-center gap-2 rounded-md border px-3 text-xs font-semibold disabled:opacity-50 ${completed ? "border-emerald-200 text-emerald-800" : "border-[#ccd4d0]"}`}>{pending ? <LoaderCircle size={15} className="animate-spin" /> : completed ? <Check size={15} /> : null}{completed ? "Reviewed" : "Mark reviewed"}</button>
    {!state.success && state.message && <p role="alert" className="mt-2 text-xs text-rose-700">{state.message}</p>}
  </form>;
}

export function PlatformNoteForm({ producerId }: { producerId: string }) {
  const [state, action, pending] = useActionState(managePlatformProducer.bind(null, producerId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) ref.current?.reset(); }, [state]);
  return <form ref={ref} action={action} className="space-y-3"><input name="operation" type="hidden" value="note" /><label className="block text-sm font-semibold">Private account note<textarea name="body" required maxLength={5000} rows={4} className="mt-2 block w-full max-w-2xl rounded-md border border-[#ccd4d0] p-3 text-sm font-normal" /></label><Feedback state={state} /><Submit pending={pending}>Add note</Submit></form>;
}

export function CopyInvitationLink() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return <div><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/staff-invitations`); setCopied(true); setError(""); } catch { setError("Unable to copy. Use the invitation page link below."); } }} className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy invitation link"}</button>{error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}</div>;
}
