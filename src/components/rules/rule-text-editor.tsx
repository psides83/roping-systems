"use client";

import { useId, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon } from "lucide-react";

export function RuleTextEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  function insert(before: string, after = "") {
    const input = ref.current;
    if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const selected = value.slice(start, end) || "text";
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  return <div>
    <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
    <textarea id={id} ref={ref} value={value} maxLength={20000} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-32 w-full max-w-3xl rounded-md border border-[#ccd4d0] bg-white p-3 text-sm leading-6" />
    <div className="flex gap-1" aria-label={`${label} formatting`}>
      {[{ name: "Bold", icon: Bold, before: "**", after: "**" }, { name: "Italic", icon: Italic, before: "*", after: "*" }, { name: "Bulleted list", icon: List, before: "\n- ", after: "" }, { name: "Numbered list", icon: ListOrdered, before: "\n1. ", after: "" }, { name: "Link", icon: LinkIcon, before: "[", after: "](https://)" }].map(({ name, icon: Icon, before, after }) => <button key={name} type="button" title={name} aria-label={name} className="grid h-10 w-10 place-items-center rounded-md hover:bg-[#edf0ee]" onClick={() => insert(before, after)}><Icon size={17} /></button>)}
    </div>
  </div>;
}
