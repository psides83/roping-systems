"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Eye, Save, Upload, X } from "lucide-react";
import { saveRules } from "@/app/(app)/settings/rules/actions";
import { rulesPublishErrors, type RulesDocument } from "@/lib/producer-rules";
import { RuleTextEditor } from "./rule-text-editor";
import { RulesContent } from "./rules-content";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";

type Section = RulesDocument["sections"][number];
const field = "mt-2 block h-10 w-full max-w-md rounded-md border border-[#ccd4d0] bg-white px-3 text-sm";
const button = "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-40";
function move<T>(items: T[], index: number, direction: number) {
  const next = [...items];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

export function RulesEditor({ initial, initialRevision, initialPublished }: { initial: RulesDocument; initialRevision: number; initialPublished: boolean }) {
  const [document, setDocument] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [revision, setRevision] = useState(initialRevision);
  const [published, setPublished] = useState(initialPublished);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(false);
  const [confirmation, setConfirmation] = useState<"publish" | "unpublish" | null>(null);
  const dirty = JSON.stringify(document) !== saved;
  function update(patch: Partial<RulesDocument>) { setDocument((current) => ({ ...current, ...patch })); setStatus(""); }
  function sectionChange(id: string, patch: Partial<Section>) { update({ sections: document.sections.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function act(operation: "save" | "publish" | "unpublish") {
    setError("");
    startTransition(async () => {
      try {
        const result = await saveRules(document, revision, operation);
        if (result.error) { setError(result.error); return; }
        setRevision(result.revision!);
        if (operation !== "unpublish") setSaved(JSON.stringify(document));
        if (operation !== "save") setPublished(operation === "publish");
        setStatus(operation === "save" ? "Draft saved. Public rules are unchanged." : operation === "publish" ? "Rules published." : "Rules unpublished. Your draft is retained.");
        setConfirmation(null);
      } catch { setError("Unable to save. Your edits are still here; please try again."); }
    });
  }
  const issues = rulesPublishErrors(document);
  return <div className="space-y-5">
    <UnsavedChangesGuard dirty={dirty} saving={pending} onSave={() => act("save")} />
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[#d7ddda] bg-[#f5f6f7] py-3">
      <span className={`mr-2 rounded-md px-2 py-1 text-xs font-semibold ${published ? "bg-emerald-50 text-emerald-800" : "bg-[#e7ebe8]"}`}>{published ? "Published" : "Not published"}</span>
      <span className="mr-auto text-xs text-[#66716b]">{dirty ? "Unsaved changes" : revision ? "Draft saved" : "New draft"}</span>
      <button className={button} onClick={() => setPreview(true)}><Eye size={16} />Preview</button>
      <button className={button} disabled={pending} onClick={() => act("save")}><Save size={16} />{pending ? "Saving…" : "Save draft"}</button>
      <button className={`${button} brand-accent-fill text-white`} disabled={pending} onClick={() => { if (issues.length) setError(issues.join(" ")); else setConfirmation("publish"); }}><Upload size={16} />Publish</button>
      {published && <button className={button} disabled={pending} onClick={() => setConfirmation("unpublish")}>Unpublish</button>}
    </div>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {status && <p role="status" className="text-sm font-semibold text-emerald-800">{status}</p>}
    <fieldset disabled={pending} className="min-w-0 space-y-6">
      <div className="flex flex-wrap gap-5">
        <label className="text-sm font-semibold">Page title<input className={field} value={document.title} maxLength={150} onChange={(event) => update({ title: event.target.value })} /></label>
        <label className="text-sm font-semibold">Effective date (optional)<input className={field} type="date" value={document.effectiveOn} onChange={(event) => update({ effectiveOn: event.target.value })} /></label>
      </div>
      <RuleTextEditor disabled={pending} label="Introduction (optional)" value={document.introduction} onChange={(introduction) => update({ introduction })} />
      <div className="space-y-4">{document.sections.map((section, index) => <details key={section.id} className="rounded-md border border-[#d7ddda] bg-white p-4">
        <summary className="cursor-pointer break-words font-semibold">{index + 1}. {section.title || "Untitled section"}{!section.title.trim() || (!section.content.trim() && !section.subsections.length) ? <span className="ml-2 text-xs text-amber-800">Incomplete</span> : null}</summary>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 text-sm font-semibold">Section heading<input className={field} value={section.title} maxLength={150} onChange={(event) => sectionChange(section.id, { title: event.target.value })} /></label><OrderButtons index={index} length={document.sections.length} onMove={(direction) => update({ sections: move(document.sections, index, direction) })} onDelete={() => { if (window.confirm(`Delete ${section.title || "this section"} and its subsections?`)) update({ sections: document.sections.filter((item) => item.id !== section.id) }); }} /></div>
          <RuleTextEditor disabled={pending} label="Section text" value={section.content} onChange={(content) => sectionChange(section.id, { content })} />
          {section.subsections.map((child, childIndex) => <div key={child.id} className="space-y-3 border-t border-[#dfe4e1] pt-4">
            <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 text-sm font-semibold">Subsection heading<input className={field} value={child.title} maxLength={150} onChange={(event) => sectionChange(section.id, { subsections: section.subsections.map((item) => item.id === child.id ? { ...item, title: event.target.value } : item) })} /></label><OrderButtons index={childIndex} length={section.subsections.length} onMove={(direction) => sectionChange(section.id, { subsections: move(section.subsections, childIndex, direction) })} onDelete={() => { if (window.confirm(`Delete ${child.title || "this subsection"}?`)) sectionChange(section.id, { subsections: section.subsections.filter((item) => item.id !== child.id) }); }} /></div>
            <RuleTextEditor disabled={pending} label="Subsection text" value={child.content} onChange={(content) => sectionChange(section.id, { subsections: section.subsections.map((item) => item.id === child.id ? { ...item, content } : item) })} />
          </div>)}
          <button type="button" className={button} disabled={section.subsections.length >= 30} onClick={() => sectionChange(section.id, { subsections: [...section.subsections, { id: crypto.randomUUID(), title: "", content: "" }] })}><Plus size={16} />Add subsection</button>
        </div>
      </details>)}</div>
      <button type="button" className={button} disabled={document.sections.length >= 50} onClick={() => update({ sections: [...document.sections, { id: crypto.randomUUID(), title: "", content: "", subsections: [] }] })}><Plus size={16} />Add section</button>
      <section className="space-y-4 border-t border-[#d7ddda] pt-5"><h2 className="font-bold">PDF documents</h2>
        {document.attachments.map((item) => <div key={item.id} className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Document name<input className={field} value={item.name} maxLength={150} onChange={(event) => update({ attachments: document.attachments.map((attachment) => attachment.id === item.id ? { ...attachment, name: event.target.value } : attachment) })} /></label><label className="min-w-0 text-sm font-semibold">PDF link<input type="url" className={field} value={item.url} maxLength={2048} placeholder="https://…/rules.pdf" onChange={(event) => update({ attachments: document.attachments.map((attachment) => attachment.id === item.id ? { ...attachment, url: event.target.value } : attachment) })} /></label><button type="button" title="Remove document" aria-label="Remove document" className={button} onClick={() => update({ attachments: document.attachments.filter((attachment) => attachment.id !== item.id) })}><Trash2 size={16} /></button></div>)}
        <button type="button" className={button} disabled={document.attachments.length >= 10} onClick={() => update({ attachments: [...document.attachments, { id: crypto.randomUUID(), name: "", url: "" }] })}><Plus size={16} />Add PDF link</button>
      </section>
    </fieldset>
    {preview && <RulesDialog title="Rules preview" onClose={() => setPreview(false)}><RulesContent document={document} preview /></RulesDialog>}
    {confirmation && <RulesDialog title={confirmation === "publish" ? "Publish rules?" : "Unpublish rules?"} onClose={() => !pending && setConfirmation(null)}><p className="mb-5 text-sm">{confirmation === "publish" ? "This replaces the rules currently visible to the public with this draft." : "The public rules will be hidden. Your draft will remain available."}</p>{error && <p role="alert" className="mb-4 text-sm text-rose-800">{error}</p>}<button className={button} disabled={pending} onClick={() => act(confirmation)}>{pending ? "Saving…" : "Confirm"}</button></RulesDialog>}
  </div>;
}

function OrderButtons({ index, length, onMove, onDelete }: { index: number; length: number; onMove: (direction: number) => void; onDelete: () => void }) {
  return <div className="flex gap-1"><button type="button" className={button} title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} /></button><button type="button" className={button} title="Move down" aria-label="Move down" disabled={index === length - 1} onClick={() => onMove(1)}><ArrowDown size={16} /></button><button type="button" className={button} title="Delete" aria-label="Delete" onClick={onDelete}><Trash2 size={16} /></button></div>;
}

function RulesDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const previous = window.document.body.style.overflow; window.document.body.style.overflow = "hidden"; return () => { window.document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} onClose={onClose} aria-label={title} className="m-auto max-h-[90svh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-md border border-[#d7ddda] bg-white p-5 text-[#17201c] shadow-xl backdrop:bg-black/45"><header className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><button type="button" title="Close" aria-label="Close" className={button} onClick={onClose}><X size={18} /></button></header>{children}</dialog>;
}
