"use client";

import { useActionState, useState } from "react";
import { Check, LoaderCircle, Paintbrush, Save } from "lucide-react";
import { updateOrganizationBranding, type OrganizationBrandingState } from "@/app/(app)/settings/actions";
import { brandingPresets, getBrandStyle } from "@/lib/branding";

const hexPattern = /^#[0-9A-Fa-f]{6}$/;

export function OrganizationBrandingForm({ primary: initialPrimary, accent: initialAccent, canEdit, readOnlyMessage }: { primary: string; accent: string; canEdit: boolean; readOnlyMessage: string }) {
  const [state, action, pending] = useActionState<OrganizationBrandingState, FormData>(updateOrganizationBranding, {});
  const [primary, setPrimary] = useState(initialPrimary);
  const [accent, setAccent] = useState(initialAccent);
  const validPrimary = hexPattern.test(primary);
  const validAccent = hexPattern.test(accent);

  function choosePreset(nextPrimary: string, nextAccent: string) {
    setPrimary(nextPrimary);
    setAccent(nextAccent);
  }

  return <div className="mb-6 border-b border-[#e7ebe8] pb-6"><div className="flex items-center gap-2"><Paintbrush size={17} className="text-[var(--brand-accent-strong)]" /><h3 className="text-sm font-bold">Brand colors</h3></div><p className="mt-1 text-xs leading-5 text-[#758078]">Applied to the organization workspace and public pages while keeping data surfaces neutral and readable.</p><div style={getBrandStyle(validPrimary ? primary : initialPrimary, validAccent ? accent : initialAccent)} className="mt-4 overflow-hidden rounded-md border border-[#dfe4e1]"><div className="brand-primary-fill flex h-14 items-center justify-between px-4"><span className="text-sm font-bold">Organization header</span><span className="brand-accent-fill rounded-md px-3 py-1.5 text-xs font-bold">Primary action</span></div><div className="flex items-center gap-3 bg-white p-4"><span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-accent)]" /><span className="text-xs font-semibold text-[#66716b]">Live result and highlight treatment</span></div></div>{canEdit ? <form action={action} className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-3">{brandingPresets.map((preset) => { const selected = primary.toUpperCase() === preset.primary && accent.toUpperCase() === preset.accent; return <button key={preset.name} type="button" onClick={() => choosePreset(preset.primary, preset.accent)} className={`flex items-center gap-2 rounded-md border p-2 text-left text-xs font-semibold ${selected ? "border-[var(--brand-accent)] bg-[var(--brand-accent-tint)]" : "border-[#dfe4e1]"}`}><span className="flex"><span style={{ backgroundColor: preset.primary }} className="h-6 w-6 rounded-l" /><span style={{ backgroundColor: preset.accent }} className="h-6 w-6 rounded-r" /></span><span className="min-w-0 flex-1 truncate">{preset.name}</span>{selected ? <Check size={14} className="text-[var(--brand-accent-strong)]" /> : null}</button>; })}</div><div className="grid gap-3 sm:grid-cols-2"><ColorField label="Primary" name="primary" value={primary} onChange={setPrimary} error={state.errors?.primary?.[0]} /><ColorField label="Accent" name="accent" value={accent} onChange={setAccent} error={state.errors?.accent?.[0]} /></div>{state.message ? <p className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p> : null}<div className="flex justify-end"><button disabled={pending || !validPrimary || !validAccent} className="brand-primary-fill flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold disabled:opacity-40">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Save colors</button></div></form> : <p className="mt-3 text-xs text-[#758078]">{readOnlyMessage}</p>}</div>;
}

function ColorField({ label, name, value, onChange, error }: { label: string; name: string; value: string; onChange: (value: string) => void; error?: string }) {
  return <label className="text-xs font-bold text-[#526058]">{label}<span className="mt-2 flex h-11 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-2 focus-within:border-[var(--brand-accent)]"><input type="color" value={hexPattern.test(value) ? value : "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0" aria-label={`${label} color picker`} /><input name={name} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase outline-none" maxLength={7} /></span>{error ? <span className="mt-1 block font-medium text-rose-700">{error}</span> : null}</label>;
}
