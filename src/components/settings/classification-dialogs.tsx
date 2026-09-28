"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { createClassification, createDiscipline, type ClassificationFormState } from "@/app/(app)/settings/classifications/actions";

const initialState: ClassificationFormState = {};
const inputClass = "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

function DialogFrame({ title, description, close, children }: { title: string; description: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4"><button aria-label="Close dialog" className="absolute inset-0" onClick={close} /><section role="dialog" aria-modal="true" className="relative my-8 w-full max-w-xl rounded-md bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-[#e1e6e3] p-5"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm leading-5 text-[#66716b]">{description}</p></div><button onClick={close} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"><X size={18} /></button></header>{children}</section></div>;
}

function FormMessage({ state }: { state: ClassificationFormState }) {
  return state.message ? <p className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p> : null;
}

export function CreateDisciplineDialog({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createDiscipline, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);

  return <><button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold"><Plus size={17} /> Division</button>{open ? <DialogFrame title="Create division" description="Create the first-level event split, such as Calf roping or Breakaway. Each division can have its own classifications." close={() => setOpen(false)}><form ref={formRef} action={action} className="space-y-4 p-5"><label className="block text-sm font-semibold">Name<input name="name" className={inputClass} placeholder="Calf roping" required />{state.errors?.name ? <span className="mt-1 block text-xs text-rose-700">{state.errors.name[0]}</span> : null}</label><label className="block text-sm font-semibold">Description<textarea name="description" className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]" placeholder="Describe this division" /></label><label className="block text-sm font-semibold">Watch events before review<input name="watchThreshold" type="number" min="1" max="20" defaultValue="3" className={inputClass} /><span className="mt-1.5 block text-xs font-normal text-[#758078]">Leave blank when the organization does not use a watch threshold.</span></label><FormMessage state={state} /><div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button><button disabled={pending || !enabled} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}Create division</button></div></form></DialogFrame> : null}</>;
}

export function CreateClassificationDialog({ disciplineId, disciplineName, enabled }: { disciplineId: string; disciplineName: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createClassification, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);

  return <><button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-accent-strong)]"><Plus size={14} /> Add classification</button>{open ? <DialogFrame title={`Add ${disciplineName} classification`} description="Classifications may represent skill level, an open class, or an age-limited group. Rank controls their organization-defined order." close={() => setOpen(false)}><form ref={formRef} action={action} className="space-y-4 p-5"><input type="hidden" name="disciplineId" value={disciplineId} /><div className="grid gap-4 sm:grid-cols-[1fr_140px]"><label className="block text-sm font-semibold">Classification name<input name="name" className={inputClass} placeholder="Open, 11.5, 40+" required />{state.errors?.name ? <span className="mt-1 block text-xs text-rose-700">{state.errors.name[0]}</span> : null}</label><label className="block text-sm font-semibold">Rank<input name="rank" type="number" defaultValue="0" className={inputClass} required /></label></div><label className="block text-sm font-semibold">Description<textarea name="description" className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]" placeholder="Skill or age eligibility notes" /></label><FormMessage state={state} /><div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold">Cancel</button><button disabled={pending || !enabled} className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}Add classification</button></div></form></DialogFrame> : null}</>;
}
