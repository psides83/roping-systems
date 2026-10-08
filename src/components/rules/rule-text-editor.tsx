"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { rulesEditorExtensions } from "@/lib/rules-editor-extensions";
import { ruleTextStyle } from "@/lib/rule-text-style";
import { RuleEditorToolbar } from "./rule-editor-toolbar";

export function RuleTextEditor({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [limit, setLimit] = useState(false);
  const synced = useRef(value);
  const editor = useEditor({
    extensions: rulesEditorExtensions(() => setLimit(true)),
    content: value, contentType: "markdown", immediatelyRender: false,
    editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-labelledby": id, class: "min-h-40 p-3 outline-none" } },
    onUpdate: ({ editor }) => { const markdown = editor.getMarkdown(); synced.current = markdown; setLimit(false); onChange(markdown); },
  });
  useEffect(() => {
    if (editor && value !== synced.current) {
      editor.chain().setMeta("rulesSource", true).setContent(value, { contentType: "markdown", emitUpdate: false }).run();
      synced.current = value;
    }
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);

  return <div className="max-w-3xl min-w-0">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span id={id} className="text-sm font-semibold">{label}</span>
      <div className="flex gap-1 rounded-md border border-[#ccd4d0] p-0.5" aria-label={`${label} editor mode`}>
        {(["visual", "markdown"] as const).map((item) => <button key={item} type="button" disabled={disabled} aria-pressed={mode === item} onClick={() => setMode(item)} className={`h-8 rounded px-2.5 text-xs font-semibold ${mode === item ? "bg-[#e7ebe8] text-[#17201c]" : "text-[#66716b]"}`}>{item === "visual" ? "Visual" : "Markdown"}</button>)}
      </div>
    </div>
    <div className="overflow-hidden rounded-md border border-[#ccd4d0] bg-white focus-within:border-[var(--brand-accent)] focus-within:ring-1 focus-within:ring-[var(--brand-accent)]">
      {mode === "visual" && editor && <RuleEditorToolbar editor={editor} disabled={disabled} />}
      <div hidden={mode !== "visual"} className={`${ruleTextStyle} [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-[#758078] [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]`}>
        {editor ? <EditorContent editor={editor} /> : <div role="status" className="min-h-40 animate-pulse bg-[#f5f6f7] p-3 text-sm text-[#66716b]">Loading editor…</div>}
      </div>
      {mode === "markdown" && <textarea aria-labelledby={id} disabled={disabled} value={value} maxLength={20000} onChange={(event) => { setLimit(false); onChange(event.target.value); }} className="block min-h-40 w-full resize-y border-0 p-3 font-mono text-sm leading-6 outline-none" />}
    </div>
    {limit && <p role="alert" className="mt-2 text-xs text-rose-800">This field allows up to 20,000 characters. Shorten the text before adding more.</p>}
  </div>;
}
